import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ToolDefinition } from "../types/tool-definition.js";

/**
 * Register an MCP tool. The HTTP transport (http-server.ts) wraps every
 * incoming request in `sessionContext.run({ sessionId, qboCreds }, ...)`
 * BEFORE invoking the SDK's request handler, so AsyncLocalStorage carries
 * the per-request state into every tool handler automatically. We don't
 * need to re-wrap here.
 */
export function RegisterTool<T extends z.ZodType<any, any>>(
  server: McpServer,
  toolDefinition: ToolDefinition<T>,
) {
  server.tool(
    toolDefinition.name,
    toolDefinition.description,
    { params: toolDefinition.schema },
    toolDefinition.handler,
  );
}
