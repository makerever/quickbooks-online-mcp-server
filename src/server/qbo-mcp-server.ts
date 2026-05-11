import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Build a fresh MCP server instance with no tools registered.
 *
 * In stateless HTTP mode the SDK recommends one transport + server pair per
 * request to avoid JSON-RPC id collisions across concurrent callers, so this
 * factory is intentionally not a singleton. Tool registration happens in
 * {@link import("./register-all-tools.js").registerAllTools}.
 */
export function createMcpServer(): McpServer {
  return new McpServer(
    {
      name: "QuickBooks Online MCP Server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
}
