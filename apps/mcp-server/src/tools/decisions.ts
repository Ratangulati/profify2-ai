import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { loadDecisions } from "../data/evidence.js";
import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerDecisionsTool(server: McpServer) {
  server.tool(
    "get_decision_history",
    "Get past decisions with rationale and evidence. Use to understand why something was decided before changing it.",
    {
      project_id: z.string().describe("The project ID"),
      feature_area: z.string().optional().describe("Filter decisions by feature area"),
      query: z.string().optional().describe("Search decision titles and rationale"),
      limit: z.number().min(1).max(30).default(10).describe("Max results (default 10)"),
    },
    async ({ project_id, feature_area, query, limit }) => {
      const auth = await withAuth(project_id, "decision:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("decisions", { project_id, feature_area, query, limit });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      const decisions = await loadDecisions(project_id, {
        query,
        featureArea: feature_area,
        limit,
      });

      const result = {
        decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          rationale: d.rationale,
          outcome: d.outcome,
          status: d.status,
          evidence: d.decisionEvidence.map((de) => ({
            type: de.insight.type,
            reference: de.insight.id,
            summary: de.insight.title,
          })),
          decided_at: d.decidedAt?.toISOString() ?? null,
          created_at: d.createdAt.toISOString(),
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
