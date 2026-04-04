import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createProvider } from "@pm-yc/ai";
import { db } from "@pm-yc/db";
import { z } from "zod";

import { loadSpecWithContext, findSpecByTitle } from "../data/specs.js";
import { env, getLLMApiKey } from "../env.js";
import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerEdgeCasesTool(server: McpServer) {
  server.tool(
    "get_edge_cases",
    "Get enumerated edge cases with expected behaviors for a feature. Combines spec assumptions, feedback pain points, and LLM inference.",
    {
      project_id: z.string().describe("The project ID"),
      spec_id: z.string().optional().describe("Spec ID to analyze"),
      feature_area: z.string().optional().describe("Feature area to search (if no spec_id)"),
    },
    async ({ project_id, spec_id, feature_area }) => {
      const auth = await withAuth(project_id, "spec:read");
      checkRateLimit(auth.keyId);

      if (!spec_id && !feature_area) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Provide spec_id or feature_area" }),
            },
          ],
          isError: true,
        };
      }

      const ck = cacheKey("edge_cases", { project_id, spec_id, feature_area });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      // Resolve spec
      let resolvedSpecId = spec_id;
      if (!resolvedSpecId && feature_area) {
        const found = await findSpecByTitle(project_id, feature_area);
        if (!found) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: `No spec found matching "${feature_area}"` }),
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
      const sections = (content.sections ?? []) as Array<{ title: string; content: string }>;

      // Gather assumptions (HIGH risk become explicit edge cases)
      const highRiskAssumptions = spec.assumptions
        .filter((a) => a.riskLevel === "HIGH")
        .map((a) => ({
          description: a.assumption,
          expected_behavior: a.suggestion ?? "Behavior undefined — needs specification",
          severity: "high" as const,
          source: "spec" as const,
        }));

      // Gather pain points from linked feedback
      const painInsights = await db.insight.findMany({
        where: {
          projectId: project_id,
          type: "PAIN_POINT",
          specEvidence: { some: { specId: resolvedSpecId! } },
        },
        take: 10,
        select: { title: true, description: true, severityScore: true },
      });

      const feedbackEdgeCases = painInsights.map((p) => ({
        description: p.title,
        expected_behavior: `Address: ${p.description.slice(0, 150)}`,
        severity: (p.severityScore >= 4 ? "high" : p.severityScore >= 2 ? "medium" : "low") as
          | "high"
          | "medium"
          | "low",
        source: "feedback" as const,
      }));

      // Use LLM to infer additional edge cases
      let inferredEdgeCases: Array<{
        description: string;
        expected_behavior: string;
        severity: "low" | "medium" | "high";
        source: "inferred";
      }> = [];

      const apiKey = getLLMApiKey();
      if (apiKey) {
        const provider = createProvider({ type: env.LLM_PROVIDER, apiKey });
        const specText = sections
          .map((s) => `## ${s.title}\n${s.content.replace(/<[^>]+>/g, "")}`)
          .join("\n\n");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
          const response = await provider.complete({
            messages: [
              {
                role: "system",
                content: `Analyze this spec and return edge cases as JSON array:
[{ "description": "...", "expected_behavior": "...", "severity": "low"|"medium"|"high" }]
Focus on: error states, boundary conditions, concurrent access, data consistency, permission edge cases, empty/null states, performance limits. Return 5-10 edge cases.`,
              },
              { role: "user", content: specText.slice(0, 6000) },
            ],
            temperature: 0.3,
            maxTokens: 3000,
          });

          clearTimeout(timeout);

          const jsonMatch = response.content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Array<{
              description: string;
              expected_behavior: string;
              severity: string;
            }>;
            inferredEdgeCases = parsed.map((p) => ({
              description: p.description,
              expected_behavior: p.expected_behavior,
              severity: (["low", "medium", "high"].includes(p.severity) ? p.severity : "medium") as
                | "low"
                | "medium"
                | "high",
              source: "inferred" as const,
            }));
          }
        } catch {
          clearTimeout(timeout);
          // LLM failure is non-fatal — we still return spec + feedback edge cases
        }
      }

      const result = {
        edge_cases: [...highRiskAssumptions, ...feedbackEdgeCases, ...inferredEdgeCases],
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
