import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { searchAllEntities } from "../data/search.js";
import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerSearchTool(server: McpServer) {
  server.tool(
    "search_all_knowledge",
    "Search across ALL platform data: insights, specs, decisions, feedback, themes, opportunities. Returns ranked results.",
    {
      project_id: z.string().describe("The project ID"),
      query: z.string().describe("Search query across all knowledge"),
      limit: z.number().min(1).max(50).default(20).describe("Max results (default 20)"),
    },
    async ({ project_id, query, limit }) => {
      const auth = await withAuth(project_id, "project:read");
      checkRateLimit(auth.keyId);

      const results = await searchAllEntities(project_id, query, limit);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ results }, null, 2),
          },
        ],
      };
    },
  );
}
