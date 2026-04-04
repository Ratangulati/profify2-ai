import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@pm-yc/db";
import { z } from "zod";

import { loadOpportunityInsightsWithQuotes, countOpportunityFeedback } from "../data/evidence.js";
import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerOpportunityTool(server: McpServer) {
  server.tool(
    "get_opportunity_details",
    "Get full opportunity details: scores (composite, RICE, ICE), evidence chain with quotes, linked specs, and themes.",
    {
      project_id: z.string().describe("The project ID"),
      opportunity_id: z.string().describe("The opportunity ID"),
    },
    async ({ project_id, opportunity_id }) => {
      const auth = await withAuth(project_id, "opportunity:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("opportunity", { project_id, opportunity_id });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { content: [{ type: "text" as const, text: cached }] };
      }

      const opp = await db.opportunity.findUniqueOrThrow({
        where: { id: opportunity_id },
        include: {
          linkedThemes: {
            include: {
              theme: {
                select: { id: true, title: true, feedbackCount: true },
              },
            },
          },
        },
      });

      if (opp.projectId !== project_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Opportunity not in this project" }),
            },
          ],
          isError: true,
        };
      }

      const [insights, feedbackCount] = await Promise.all([
        loadOpportunityInsightsWithQuotes(opportunity_id),
        countOpportunityFeedback(opportunity_id),
      ]);

      // Find specs that reference this opportunity's insights
      const insightIds = insights.map((i) => i.id);
      const linkedSpecs =
        insightIds.length > 0
          ? await db.spec.findMany({
              where: {
                projectId: project_id,
                evidence: {
                  some: { insightId: { in: insightIds } },
                },
              },
              select: { id: true, title: true, status: true },
              distinct: ["id"],
            })
          : [];

      const getConfidence = (count: number) =>
        count > 20 ? "high" : count > 10 ? "medium" : "low";

      const result = {
        opportunity: {
          id: opp.id,
          title: opp.title,
          description: opp.description,
          status: opp.status,
        },
        scores: {
          composite: {
            score: opp.compositeScore,
            frequency: opp.frequencyScore,
            severity: opp.severityScore,
            alignment: opp.strategicAlignment,
            effort_inverse: opp.effortEstimate ? 1 / opp.effortEstimate : 0,
            confidence: getConfidence(insights.length),
          },
          rice: {
            score: opp.riceScore,
            reach: opp.riceReach,
            impact: opp.riceImpact,
            confidence: opp.riceConfidence,
            effort: opp.riceEffort,
          },
          ice: {
            score: opp.iceScore,
            impact: opp.iceImpact,
            confidence: opp.iceConfidence,
            ease: opp.iceEase,
          },
          segment_weighted_freq: opp.segmentWeightedFreq,
        },
        evidence_chain: {
          insights: insights.map((i) => ({
            id: i.id,
            title: i.title,
            type: i.type,
            severity: i.severityScore,
            quotes: i.quotes,
          })),
          feedback_count: feedbackCount,
        },
        linked_specs: linkedSpecs,
        themes: opp.linkedThemes.map((lt) => ({
          id: lt.theme.id,
          title: lt.theme.title,
          feedback_count: lt.theme.feedbackCount,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { content: [{ type: "text" as const, text }] };
    },
  );
}
