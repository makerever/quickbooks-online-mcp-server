## Setup

This server is a multi-tenant HTTP MCP server. Each caller (typically an
n8n workflow) supplies their own QuickBooks Online OAuth2 access token
via the `qbo_connect` MCP tool. The server holds those credentials in
memory only, scoped to the MCP session id, and never persists them.

For deployment instructions (Railway + n8n) see
[`docs/RAILWAY_DEPLOY.md`](../../docs/RAILWAY_DEPLOY.md).

1. Install dependencies:

```bash
npm install
```

2. (Optional) Create a `.env` file in the root directory with your
   Intuit Developer app identity. These are used as the
   `consumerKey` / `consumerSecret` parameters on the `node-quickbooks`
   constructor; they are not used to acquire tokens (the caller does
   that out of band).

```env
PORT=3000
QBO_CLIENT_ID=your_intuit_app_client_id
QBO_CLIENT_SECRET=your_intuit_app_client_secret
```

3. Build + start:

```bash
npm run build
npm start
```

4. Each MCP caller's first tool call must be `qbo_connect` with their
   own `accessToken` and `realmId`. From then on every QuickBooks tool
   in that session uses those credentials.
