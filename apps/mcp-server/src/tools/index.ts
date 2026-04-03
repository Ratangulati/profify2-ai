import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTools(server: McpServer) {
  server.tool(
    "analyze-product",
    "Analyze a product and return insights about it",
    {
      productName: z.string().describe("The name of the product to analyze"),
      aspects: z
        .array(z.string())
        .optional()
        .describe("Specific aspects to analyze (e.g., pricing, features, competitors)"),
    },
    async ({ productName, aspects }) => {
      const analysisAspects = aspects ?? ["features", "pricing", "market-fit"];

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                product: productName,
                aspects: analysisAspects,
                status: "Analysis complete",
                insights: analysisAspects.map((aspect) => ({
                  aspect,
                  summary: `Placeholder analysis for ${aspect} of ${productName}`,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "list-insights",
    "List available product insights",
    {
      limit: z.number().optional().default(10).describe("Maximum number of insights to return"),
    },
    async ({ limit }) => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                insights: [],
                total: 0,
                limit,
                message: "No insights available yet. Analyze a product first.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
