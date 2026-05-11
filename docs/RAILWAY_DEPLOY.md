# Deploying the QuickBooks MCP Server to Railway

An **auth-independent**, multi-tenant MCP server. It speaks MCP Streamable
HTTP on `POST /mcp`. The caller (your Django app, n8n configured by Django,
your own backend — anything that already holds a valid QBO access token)
puts QuickBooks credentials directly in the `Authorization` header. The
MCP server is a thin proxy: parse, use, throw away. 1000+ orgs can hit
the server concurrently — each org's creds live only in its own request
scope.

## Architecture

```
   ┌──────────────┐                     ┌─────────────────┐         ┌────────────┐
   │ Your Django  │ ──Bearer header──→  │ This MCP server │ ──→     │ QuickBooks │
   │ connector    │                     │  (thin proxy)   │         │  Online    │
   │ hub          │                     └─────────────────┘         └────────────┘
   └──────────────┘
   has QBO access token       parses bearer, builds          uses creds,
   + realmId + environment    node-quickbooks per request,   returns data
   (refreshes with Intuit)    throws it away when done
```

- No central auth service to call out to. The bearer carries everything.
- The caller is fully trusted — your Django app already proved the user
  has access by handing them this bearer.
- Each request runs in its own AsyncLocalStorage scope. No shared state.

## Bearer format (the contract your Django app produces)

```
Authorization: Bearer <qbo-access-token>|<realmId>|<environment>
```

- `<qbo-access-token>` — Intuit OAuth2 access token (the `eyJ...` JWE).
  Your Django app refreshes this with Intuit before handing it out.
- `<realmId>` — QuickBooks company id (returned by Intuit's OAuth callback).
- `<environment>` — `sandbox` or `production`. Optional. Defaults to
  `production` if omitted.

`|` is the separator. Intuit's JWE tokens never contain `|`, so it's safe.
Whitespace around each segment is trimmed.

Examples:

```
Authorization: Bearer eyJ...long.token...|9341455463289738|sandbox
Authorization: Bearer eyJ...long.token...|9341455463289738|production
Authorization: Bearer eyJ...long.token...|9341455463289738
```

## How your Django app produces the bearer

Conceptually:

```python
def build_mcp_bearer(user):
    conn = user.connections.filter(
        connector__slug='quickbooks', status='active'
    ).first()
    if not conn:
        raise ValueError('User has not connected QuickBooks')
    conn.refresh_if_expired()   # your existing logic
    env = conn.config.get('environment', 'production')
    return f"Bearer {conn.access_token}|{conn.config['realm_id']}|{env}"
```

Hand `bearer` to whatever client makes the MCP call. In n8n: store it in
a Bearer Auth credential. In your own service: stick it on the
`Authorization` header.

## 1. Prerequisites

- A Railway account.
- This repo pushed to GitHub.
- Your Django app already managing per-user QBO OAuth + refresh.

## 2. Deploy

1. **New Project → Deploy from GitHub** → pick this repo. Railway uses
   the [`Dockerfile`](../Dockerfile) and [`railway.json`](../railway.json).

2. **Variables** under *Settings → Variables*:

   | Variable | Required | Value |
   | --- | --- | --- |
   | `QBO_CLIENT_ID` | optional | Intuit Developer app client id (passed through to `node-quickbooks` as identity). |
   | `QBO_CLIENT_SECRET` | optional | Same — `consumerSecret`. |

   `PORT` is set by Railway automatically — don't override.

3. **Generate a public domain** under *Settings → Networking → Generate Domain*.

4. **Smoke test:**

   ```bash
   curl https://<your-domain>/healthz
   # {"status":"ok"}

   # Without auth — must be 401
   curl -i -X POST https://<your-domain>/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

   # With a valid composite bearer — must be 200, returns Mcp-Session-Id header
   curl -i -X POST https://<your-domain>/mcp \
     -H 'Authorization: Bearer YOUR_QBO_TOKEN|YOUR_REALM_ID|sandbox' \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
   ```

## 3. Connect n8n

1. Drop in an **MCP Client** node.
2. **Endpoint:** `https://<your-domain>/mcp`
3. **Server Transport:** `HTTP Streamable`
4. **Authentication:** `Bearer Auth`.
5. **Credential → Bearer Auth → Token:** the composite string

   ```
   <qbo-access-token>|<realmId>|<environment>
   ```

   Per org you serve, give n8n that org's bearer string (your Django app
   generates it).

## 4. Local development

```bash
cp .env.example .env
npm install
npm run build
npm start
# [mcp] QuickBooks MCP server listening on :3000 (POST /mcp, GET /healthz)
```

End-to-end test:

```bash
JWT='YOUR_QBO_TOKEN|9341455463289738|sandbox'

SID=$(curl -s -D - -o /dev/null -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}' \
  | awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {gsub(/\r/,""); print $2}')
echo "SID=$SID"

curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $JWT" \
  -H "Mcp-Session-Id: $SID" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null

curl -s -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $JWT" \
  -H "Mcp-Session-Id: $SID" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_company_info","arguments":{"params":{}}}}'
```

## 5. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 unauthenticated` | Missing or malformed bearer | Check format: `Bearer <token>\|<realmId>\|<env>` |
| `401 ... accessToken segment is empty` / `realmId segment is empty` | Composite string malformed | Double-check the pipes |
| `401 ... environment must be sandbox or production` | Third segment is something else | Fix or omit it |
| `404 session_not_found` | Server restarted, your old session id is gone | Re-initialize and use the new id |
| 200 from `/mcp` but tool calls return `403 Authorization Failed` | env mismatch | Sandbox token must use `sandbox`; production token must use `production` |
| 200 from `/mcp` but tool calls return `Token expired` | QBO token >1h old | Your Django app must refresh with Intuit before handing the bearer to the MCP caller |

## 6. Operational notes

- **No rate limiting in this codebase.** Public + auth-gated still leaves
  you exposed to brute-force token guessing or resource abuse. Front
  with Cloudflare or a Railway egress proxy if you go wide.
- **No idle session timeout.** Sessions live until container restart or
  client `DELETE /mcp`.
- **No central credential storage.** This server forgets every QBO token
  the moment the request returns. Your Django app is the source of truth.
- **Token refresh is the caller's job.** When a tool returns
  `Token expired`, your Django app should refresh with Intuit and the
  caller should retry with the new bearer.
