import { AsyncLocalStorage } from "async_hooks";
import type { QboCreds } from "./auth-middleware.js";

/**
 * Request-scoped state propagated through every MCP tool handler call.
 *
 * The HTTP transport runs each tool inside `sessionContext.run({ ... }, ...)`
 * so handlers can resolve the current MCP session id and the QBO credentials
 * (already fetched by the auth middleware from the Django connector hub)
 * without changing their function signatures.
 */
export interface SessionContext {
  sessionId: string;
  qboCreds: QboCreds;
}

export const sessionContext = new AsyncLocalStorage<SessionContext>();

/** Returns the current MCP session id, or throws if called outside a tool handler context. */
export function getCurrentSessionId(): string {
  return getStoreOrThrow().sessionId;
}

/** Returns the current request's QBO credentials, or throws if called outside a tool handler context. */
export function getCurrentQboCreds(): QboCreds {
  return getStoreOrThrow().qboCreds;
}

function getStoreOrThrow(): SessionContext {
  const ctx = sessionContext.getStore();
  if (!ctx) {
    throw new Error(
      "No active MCP session context. This function must be called from inside an MCP tool handler.",
    );
  }
  return ctx;
}
