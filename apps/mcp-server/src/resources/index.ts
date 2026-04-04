import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerProjectResources } from "./project.js";
import { registerSpecResource } from "./spec.js";

export function registerResources(server: McpServer) {
  registerProjectResources(server);
  registerSpecResource(server);
}
