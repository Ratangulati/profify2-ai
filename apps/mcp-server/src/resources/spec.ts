import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@pm-yc/db";

import { loadSpecSummary } from "../data/specs.js";
import { withAuth } from "../middleware/auth.js";
import { cacheKey, cacheGet, cacheSet } from "../middleware/cache.js";
import { checkRateLimit } from "../middleware/rate-limit.js";

export function registerSpecResource(server: McpServer) {
  server.resource(
    "spec-document",
    "spec://{spec_id}",
    { description: "Full spec document with content, version, and counts" },
    async (uri) => {
      const specId = uri.pathname.split("/")[1]!;

      // Look up the spec's project to auth
      const specMeta = await db.spec.findUniqueOrThrow({
        where: { id: specId },
        select: { projectId: true },
      });

      const auth = await withAuth(specMeta.projectId, "spec:read");
      checkRateLimit(auth.keyId);

      const ck = cacheKey("resource:spec", { spec_id: specId });
      const cached = cacheGet<string>(ck);
      if (cached) {
        return { contents: [{ uri: uri.href, mimeType: "application/json", text: cached }] };
      }

      const spec = await loadSpecSummary(specId);
      const latestVersion = spec.versions[0];

      const result = {
        id: spec.id,
        title: spec.title,
        type: spec.type,
        status: spec.status,
        content: latestVersion?.content ?? spec.content,
        version: latestVersion?.version ?? 1,
        evidence_count: spec._count.evidence,
        assumption_count: spec._count.assumptions,
        created_at: spec.createdAt.toISOString(),
        updated_at: spec.updatedAt.toISOString(),
      };

      const text = JSON.stringify(result, null, 2);
      cacheSet(ck, text);
      return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
    },
  );
}
