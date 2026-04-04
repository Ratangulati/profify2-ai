import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";

export function createServer() {
  const server = new McpServer({
    name: "pm-yc",
    version: "0.1.0",
  });

  registerTools(server);
  registerResources(server);

  return server;
}
