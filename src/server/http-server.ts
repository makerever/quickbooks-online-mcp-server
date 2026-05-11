import express from "express";
import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpServer } from "./qbo-mcp-server.js";
import { registerAllTools } from "./register-all-tools.js";
import { authMiddleware } from "./auth-middleware.js";
import { sessionContext } from "./session-context.js";

/**
 * HTTP entry point.
 *
 * Routes:
 *   GET    /healthz                       — open, used by Railway healthcheck.
 *   POST   /mcp / GET /mcp / DELETE /mcp  — bearer-protected MCP transport.
 *
 * Auth model:
 *   Every /mcp request must carry
 *     Authorization: Bearer <qbo-access-token>|<realmId>[|<environment>]
 *   The middleware parses this and attaches creds to req.qboCreds. Without
 *   it, `tools/list` returns 401 and reveals nothing.
 *
 * Tenancy:
 *   Each HTTP request runs inside its own AsyncLocalStorage scope; the
 *   QBO client built for Org A's request shares no state with Org B's.
 */

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Shared try/catch wrapper. The SDK normally writes its own HTTP errors,
 * so this is belt-and-suspenders against an unexpected throw.
 */
export async function runTransportRequest(
  _req: Request,
  res: Response,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mcp] request failed: ${message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message });
    }
  }
}

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  const sessions = new Map<string, SessionEntry>();
  const evictSession = (sessionId: string): void => {
    sessions.delete(sessionId);
  };

  app.use("/mcp", authMiddleware);

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionIdStr =
      typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    let entry: SessionEntry | undefined;
    if (sessionIdStr) {
      entry = sessions.get(sessionIdStr);
      if (!entry) {
        res.status(404).json({
          error: "session_not_found",
          message: `Unknown Mcp-Session-Id: ${sessionIdStr}. Re-initialize.`,
        });
        return;
      }
    } else if (isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newId: string) => {
          sessions.set(newId, { transport, server });
        },
      });
      transport.onclose = () => {
        evictSession(transport.sessionId as string);
      };
      const server = createMcpServer();
      registerAllTools(server);
      await server.connect(transport);
      entry = { transport, server };
    } else {
      res.status(400).json({
        error: "bad_request",
        message:
          "Mcp-Session-Id header required for non-initialize requests. " +
          "Send an `initialize` request first to obtain a session id.",
      });
      return;
    }

    const creds = req.qboCreds!;
    const transportSessionId = entry.transport.sessionId ?? randomUUID();
    await sessionContext.run(
      { sessionId: transportSessionId, qboCreds: creds },
      () =>
        runTransportRequest(req, res, () =>
          entry.transport.handleRequest(req, res, req.body),
        ),
    );
  });

  const handleSessionScopedRequest = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionIdStr =
      typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    if (!sessionIdStr) {
      res.status(400).json({
        error: "bad_request",
        message: "Mcp-Session-Id header required.",
      });
      return;
    }
    const entry = sessions.get(sessionIdStr);
    if (!entry) {
      res.status(404).json({
        error: "session_not_found",
        message: `Unknown Mcp-Session-Id: ${sessionIdStr}.`,
      });
      return;
    }
    const creds = req.qboCreds!;
    await sessionContext.run(
      { sessionId: sessionIdStr, qboCreds: creds },
      () =>
        runTransportRequest(req, res, () => entry.transport.handleRequest(req, res)),
    );
  };

  app.get("/mcp", handleSessionScopedRequest);
  app.delete("/mcp", handleSessionScopedRequest);

  return app;
}

export function startHttpServer(port: number): HttpServer {
  const app = createApp();
  return app.listen(port, () => {
    console.log(
      `[mcp] QuickBooks MCP server listening on :${port} (POST /mcp, GET /healthz)`,
    );
  });
}
