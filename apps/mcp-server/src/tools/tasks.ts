import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@pm-yc/db";
import { z } from "zod";

import { withAuth } from "../middleware/auth.js";
import { cacheInvalidate } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerTasksTool(server: McpServer) {
  server.tool(
    "report_task_completion",
    "Report a task/ticket as completed or blocked. Updates the ticket status in the platform.",
    {
      project_id: z.string().describe("The project ID"),
      ticket_id: z.string().describe("The ticket ID"),
      status: z.enum(["completed", "blocked"]).describe("New status"),
      notes: z.string().optional().describe("Optional notes about completion or blockers"),
    },
    async ({ project_id, ticket_id, status, notes }) => {
      const auth = await withAuth(project_id, "ticket:update");
      checkRateLimit(auth.keyId);

      const ticket = await db.ticket.findUniqueOrThrow({
        where: { id: ticket_id },
        select: {
          id: true,
          title: true,
          status: true,
          projectId: true,
          externalId: true,
          externalUrl: true,
          provider: true,
          metadata: true,
        },
      });

      if (ticket.projectId !== project_id) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: "Ticket not in this project" }),
            },
          ],
          isError: true,
        };
      }

      const newStatus = status === "completed" ? "closed" : "blocked";

      // Append notes to metadata
      const metadata = (ticket.metadata as Record<string, unknown>) ?? {};
      const existingNotes = (metadata.notes as string[]) ?? [];
      if (notes) {
        existingNotes.push(`[${new Date().toISOString()}] ${notes}`);
      }

      await db.ticket.update({
        where: { id: ticket_id },
        data: {
          status: newStatus,
          metadata: { ...metadata, notes: existingNotes },
        },
      });

      // Bust any cached data that might reference this ticket
      cacheInvalidate("context:");

      const result = {
        success: true,
        ticket_title: ticket.title,
        updated_status: newStatus,
        external_url: ticket.externalUrl,
        synced_external: false,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
