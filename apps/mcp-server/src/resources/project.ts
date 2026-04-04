import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@pm-yc/db";

import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerProjectResources(server: McpServer) {
  // Roadmap
  server.resource(
    "project-roadmap",
    "project://{project_id}/roadmap",
    { description: "Current prioritized roadmap — opportunities ranked by composite score" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:roadmap", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const opportunities = await db.opportunity.findMany({
        where: { projectId },
        orderBy: { compositeScore: "desc" },
        take: 30,
        include: {
          _count: { select: { linkedInsights: true } },
        },
      });

      const result = {
        opportunities: opportunities.map((o) => ({
          id: o.id,
          title: o.title,
          status: o.status,
          composite_score: o.compositeScore,
          rice_score: o.riceScore,
          effort_estimate: o.effortEstimate,
          linked_insight_count: o._count.linkedInsights,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  // Personas
  server.resource(
    "project-personas",
    "project://{project_id}/personas",
    { description: "User personas with goals, frustrations, and behaviors" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:personas", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const personas = await db.persona.findMany({
        where: { projectId },
      });

      const result = {
        personas: personas.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          goals: p.goals,
          frustrations: p.frustrations,
          behaviors: p.behaviors,
          demographics: p.demographics,
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );

  // Themes
  server.resource(
    "project-themes",
    "project://{project_id}/themes",
    { description: "Active theme clusters with feedback counts and top insights" },
    async (uri) => {
      const projectId = uri.pathname.split("/")[1]!;
      const auth = await withAuth(projectId, "project:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:themes", { project_id: projectId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const themes = await db.theme.findMany({
        where: { projectId },
        orderBy: { feedbackCount: "desc" },
        include: {
          insights: {
            take: 5,
            orderBy: { severityScore: "desc" },
            select: { id: true, title: true, severityScore: true },
          },
        },
      });

      const result = {
        themes: themes.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          feedback_count: t.feedbackCount,
          color: t.color,
          top_insights: t.insights.map((i) => ({
            id: i.id,
            title: i.title,
            severity: i.severityScore,
          })),
        })),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );
}
