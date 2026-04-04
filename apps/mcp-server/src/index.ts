import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";

import { env } from "./env.js";
import { startCacheCleanup } from "./middleware/cache.js";
import { startRateLimitCleanup } from "./middleware/rate-limit.js";
import { createServer } from "./server.js";

const isSSE = process.argv.includes("--sse");

async function main() {
  // Start background cleanup tasks
  const stopRateLimit = startRateLimitCleanup();
  const stopCache = startCacheCleanup();

  const cleanup = () => {
    stopRateLimit();
    stopCache();
  };

  if (isSSE) {
    await startSSE(cleanup);
  } else {
    await startStdio(cleanup);
  }
}

async function startStdio(cleanup: () => void) {
  if (!env.PM_YC_API_KEY) {
    console.error("[MCP] Warning: PM_YC_API_KEY not set. All tool calls will fail authentication.");
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] PM-YC MCP server running on stdio");

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}

async function startSSE(cleanup: () => void) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0", transport: "sse" });
  });

  // Store active transports by session
  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", (req, res) => {
    const server = createServer();
    const transport = new SSEServerTransport("/mcp/messages", res);

    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);

    // Store API key from auth header in transport context
    const authHeader = req.headers.authorization;
    if (authHeader) {
      (transport as unknown as Record<string, unknown>)._apiKey = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
    }

    res.on("close", () => {
      transports.delete(sessionId);
    });

    server.connect(transport);
  });

  app.post("/mcp/messages", (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    transport.handlePostMessage(req, res);
  });

  const port = env.PORT;
  app.listen(port, () => {
    console.error(`[MCP] PM-YC MCP server running on SSE at http://localhost:${port}`);
    console.error(`[MCP] SSE endpoint: GET http://localhost:${port}/mcp/sse`);
    console.error(`[MCP] Health check: GET http://localhost:${port}/health`);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
