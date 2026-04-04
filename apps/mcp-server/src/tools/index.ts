import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerContextTool } from "./context.js";
import { registerDecisionsTool } from "./decisions.js";
import { registerEdgeCasesTool } from "./edge-cases.js";
import { registerFeedbackTool } from "./feedback.js";
import { registerOpportunityTool } from "./opportunities.js";
import { registerSearchTool } from "./search.js";
import { registerTasksTool } from "./tasks.js";
import { registerValidationTool } from "./validation.js";

export function registerTools(server: McpServer) {
  registerContextTool(server);
  registerFeedbackTool(server);
  registerOpportunityTool(server);
  registerValidationTool(server);
  registerDecisionsTool(server);
  registerTasksTool(server);
  registerEdgeCasesTool(server);
  registerSearchTool(server);
}
