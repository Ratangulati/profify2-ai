import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { createProvider, type LLMProvider } from "@pm-yc/ai";
import { z } from "zod";

import { loadSpecWithContext } from "../data/specs.js";
import { env, getLLMApiKey } from "../env.js";
import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

function getProvider(): LLMProvider {
  const apiKey = getLLMApiKey();
  if (!apiKey) {
    throw new McpError(
      ErrorCode.InternalError,
      "LLM provider not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    );
  }
  return createProvider({ type: env.LLM_PROVIDER, apiKey });
}

export function registerValidationTool(server: McpServer) {
  server.tool(
    "validate_against_spec",
    "Check if an implementation matches the spec. Returns gaps, suggestions, and coverage score. Use before committing.",
    {
      project_id: z.string().describe("The project ID"),
      spec_id: z.string().describe("The spec ID to validate against"),
      implementation_description: z
        .string()
        .max(5000)
        .describe("Description of what was implemented"),
    },
    async ({ project_id, spec_id, implementation_description }) => {
      const auth = await withAuth(project_id, "spec:read");
      checkRateLimit(auth.keyId);

      const spec = await loadSpecWithContext(spec_id);

      if (spec.projectId !== project_id) {
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ error: "Spec not in this project" }) },
          ],
          isError: true,
        };
      }

      const latestVersion = spec.versions[0];
      const content = (latestVersion?.content ?? spec.content) as Record<string, unknown>;
      const sections = (content.sections ?? []) as Array<{
        id: string;
        title: string;
        content: string;
      }>;

      const specSummary = sections
        .map((s) => `## ${s.title}\n${s.content.replace(/<[^>]+>/g, "")}`)
        .join("\n\n");

      const provider = getProvider();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await provider.complete({
          messages: [
            {
              role: "system",
              content: `You are a spec validation assistant. Compare an implementation description against a product spec.
Return JSON with this exact structure:
{
  "matches": boolean,
  "coverage_score": number (0-1),
  "gaps": string[],
  "suggestions": string[],
  "matched_requirements": string[]
}
Be specific about gaps — reference actual spec sections. Be constructive in suggestions.`,
            },
            {
              role: "user",
              content: `## SPEC\n${specSummary}\n\n## IMPLEMENTATION\n${implementation_description}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 4000,
        });

        clearTimeout(timeout);

        let result: Record<string, unknown>;
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          result = JSON.parse(jsonMatch?.[0] ?? response.content);
        } catch {
          result = {
            matches: false,
            coverage_score: 0,
            gaps: ["Could not parse validation results"],
            suggestions: [response.content],
            matched_requirements: [],
          };
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).name === "AbortError") {
          throw new McpError(
            ErrorCode.InternalError,
            "LLM request timed out (30s). Try simplifying your implementation description.",
          );
        }
        throw err;
      }
    },
  );
}
