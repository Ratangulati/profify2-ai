import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { loadSpecInsightsWithQuotes, loadDecisions } from "../data/evidence.js";
import { loadSpecWithContext, findSpecByTitle } from "../data/specs.js";
import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerContextTool(server: McpServer) {
  server.tool(
    "get_context_for_feature",
    "Get ALL context for a feature: spec, user needs, constraints, decisions, edge cases. Call this before starting work on any feature.",
    {
      project_id: z.string().describe("The project ID"),
      feature_name: z.string().optional().describe("Feature name to search for"),
      spec_id: z.string().optional().describe("Direct spec ID lookup (takes precedence)"),
    },
    async ({ project_id, feature_name, spec_id }) => {
      const auth = await withAuth(project_id, "project:read");
      checkRateLimit(auth.keyId);

      if (!spec_id && !feature_name) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Provide spec_id or feature_name" }),
            },
          ],
          isError: true,
        };
      }

      const ck = cacheKey("context", { project_id, spec_id, feature_name });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      // Resolve spec ID
      let resolvedSpecId = spec_id;
      if (!resolvedSpecId && feature_name) {
        const found = await findSpecByTitle(project_id, feature_name);
        if (!found) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `No spec found matching "${feature_name}"` }),
              },
            ],
            isError: true,
          };
        }
        resolvedSpecId = found.id;
      }

      const spec = await loadSpecWithContext(resolvedSpecId!);
      const latestVersion = spec.versions[0];
      const content = (latestVersion?.content ?? spec.content) as Record<string, unknown>;
      const sections = (content.sections ?? []) as Array<{
        id: string;
        title: string;
        content: string;
      }>;

      // Extract user needs from linked insights
      const insights = await loadSpecInsightsWithQuotes(resolvedSpecId!);
      const painPoints = insights.filter((i) => i.type === "PAIN_POINT");
      const desires = insights.filter((i) => i.type === "DESIRE");
      const allQuotes = insights.flatMap((i) => i.quotes).slice(0, 20);

      // Extract constraints from assumptions (TECHNICAL and RESOURCE categories)
      const constraints = spec.assumptions
        .filter((a) => a.category === "TECHNICAL" || a.category === "RESOURCE")
        .map((a) => a.assumption);

      // Extract data model section
      const dataModelSection = sections.find(
        (s) => s.id === "data_model" || s.title.toLowerCase().includes("data model"),
      );

      // Extract success metrics section
      const metricsSection = sections.find(
        (s) => s.id === "success_metrics" || s.title.toLowerCase().includes("success"),
      );
      const successMetrics = metricsSection
        ? [metricsSection.content.replace(/<[^>]+>/g, "").trim()]
        : [];

      // Load related decisions
      const decisions = await loadDecisions(project_id, {
        featureArea: feature_name ?? spec.title,
        limit: 10,
      });

      // Extract edge cases from HIGH risk assumptions
      const edgeCases = spec.assumptions
        .filter((a) => a.riskLevel === "HIGH")
        .map((a) => ({
          description: a.assumption,
          expected_behavior: a.suggestion ?? "Needs definition",
          source: "spec" as const,
        }));

      const result = {
        spec: {
          id: spec.id,
          title: spec.title,
          status: spec.status,
          sections: sections.map((s) => ({ id: s.id, title: s.title })),
          version: latestVersion?.version ?? 1,
        },
        user_needs: {
          pain_points: painPoints.map((p) => ({
            id: p.id,
            title: p.title,
            severity: p.severityScore,
          })),
          desires: desires.map((d) => ({ id: d.id, title: d.title })),
          quotes: allQuotes,
        },
        constraints,
        data_model: dataModelSection?.content.replace(/<[^>]+>/g, "").trim() ?? null,
        past_decisions: decisions.map((d) => ({
          id: d.id,
          title: d.title,
          rationale: d.rationale,
          outcome: d.outcome,
          status: d.status,
        })),
        success_metrics: successMetrics,
        edge_cases: edgeCases,
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
