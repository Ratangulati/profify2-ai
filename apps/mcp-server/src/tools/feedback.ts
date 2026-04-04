import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@pm-yc/db";
import { z } from "zod";

import { withAuth } from "../middleware/auth.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerFeedbackTool(server: McpServer) {
  server.tool(
    "query_user_feedback",
    "Search user feedback by keyword. Use to find what users said about a specific topic, feature, or problem.",
    {
      project_id: z.string().describe("The project ID"),
      query: z.string().describe("Search query for feedback content"),
      filters: z
        .object({
          segment: z.string().optional().describe("Filter by segment tag"),
          source: z.string().optional().describe("Filter by data source ref"),
          date_range: z
            .object({
              from: z.string().describe("Start date (ISO)"),
              to: z.string().describe("End date (ISO)"),
            })
            .optional()
            .describe("Filter by date range"),
        })
        .optional()
        .describe("Optional filters"),
      limit: z.number().min(1).max(50).default(20).describe("Max results (default 20)"),
    },
    async ({ project_id, query, filters, limit }) => {
      const auth = await withAuth(project_id, "feedback_item:read");
      checkRateLimit(auth.keyId);

      const where: Record<string, unknown> = {
        projectId: project_id,
        content: { contains: query, mode: "insensitive" },
      };

      if (filters?.segment) {
        where.segmentTags = { hasSome: [filters.segment] };
      }

      if (filters?.source) {
        where.sourceRef = { contains: filters.source, mode: "insensitive" };
      }

      if (filters?.date_range) {
        where.createdAt = {
          gte: new Date(filters.date_range.from),
          lte: new Date(filters.date_range.to),
        };
      }

      const [items, total] = await Promise.all([
        db.feedbackItem.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          select: {
            id: true,
            content: true,
            customerName: true,
            segmentTags: true,
            sentiment: true,
            sentimentScore: true,
            sourceRef: true,
            createdAt: true,
          },
        }),
        db.feedbackItem.count({ where }),
      ]);

      const result = {
        results: items.map((f) => ({
          id: f.id,
          content: f.content,
          customer_name: f.customerName,
          segment_tags: f.segmentTags,
          sentiment: f.sentiment,
          sentiment_score: f.sentimentScore,
          source: f.sourceRef,
          created_at: f.createdAt.toISOString(),
        })),
        total_matches: total,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
