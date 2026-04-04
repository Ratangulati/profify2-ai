// apps/api/src/services/copilot/stream.ts
import { createProvider } from "@pm-yc/ai";
import type { ChatMessage } from "@pm-yc/ai";
import { db, type Prisma } from "@pm-yc/db";
import type { Response } from "express";

import { env } from "../../env.js";

import { detectCommand } from "./commands.js";
import { assembleContext, type ActiveContext, type Mention } from "./context.js";
import { executeTool, formatToolsForPrompt, parseToolCall, type ToolResult } from "./tools.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  mentions: Mention[];
  activeContext: ActiveContext | null;
  threadId: string | null;
  projectId: string;
}

interface Citation {
  type: string;
  id: string;
  title: string;
  quote?: string;
}

// ── SSE helpers ───────────────────────────────────────────────────────

function sendSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Main streaming handler ────────────────────────────────────────────

export async function streamCopilotResponse(req: ChatRequest, res: Response) {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const { message, mentions, activeContext, projectId } = req;
  let { threadId } = req;

  try {
    // 1. Create or resolve thread
    if (!threadId) {
      const thread = await db.copilotThread.create({
        data: {
          projectId,
          title: message.slice(0, 100),
        },
      });
      threadId = thread.id;
      sendSSE(res, "thread_created", { threadId });
    }

    // 2. Detect pre-built command
    const command = detectCommand(message);

    // 3. Persist user message
    await db.copilotMessage.create({
      data: {
        threadId,
        role: "USER",
        content: message,
        mentions: mentions.length > 0 ? (mentions as unknown as Prisma.InputJsonValue) : undefined,
        activeContext: activeContext
          ? (activeContext as unknown as Prisma.InputJsonValue)
          : undefined,
        commandType: command?.type ?? undefined,
      },
    });

    // 4. Assemble context
    const context = await assembleContext({
      projectId,
      threadId,
      message,
      mentions,
      activeContext,
      commandPromptSuffix: command?.promptSuffix,
    });

    // 5. Build LLM messages
    const toolPrompt = formatToolsForPrompt();
    const systemContent = context.systemPrompt + "\n\n" + toolPrompt;

    const llmMessages: ChatMessage[] = [
      { role: "system", content: systemContent },
      ...context.conversationMessages,
      { role: "user", content: message },
    ];

    // 6. Create LLM provider
    const provider = createProvider({ type: "openai", apiKey: env.OPENAI_API_KEY });

    // 7. Function-calling loop (max 3 rounds)
    const toolTraces: ToolResult[] = [];
    let fullContent = "";
    const MAX_TOOL_ROUNDS = 3;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // Collect full response for tool call detection
      let roundContent = "";

      for await (const event of provider.streamComplete({
        messages: llmMessages,
        temperature: 0.4,
        maxTokens: 4000,
      })) {
        if (event.type === "content_delta" && event.content) {
          roundContent += event.content;
        }
      }

      // Check for tool call in the response
      const toolCall = parseToolCall(roundContent);

      if (toolCall && round < MAX_TOOL_ROUNDS) {
        // Tool call detected — execute it
        sendSSE(res, "tool_start", { tool: toolCall.name, input: toolCall.input });

        const toolResult = await executeTool(projectId, toolCall);
        toolTraces.push(toolResult);

        sendSSE(res, "tool_result", {
          tool: toolResult.tool,
          results: Array.isArray(toolResult.result) ? (toolResult.result as unknown[]).length : 1,
          durationMs: toolResult.durationMs,
        });

        // Strip the TOOL_CALL line from content and add to conversation
        const contentBeforeToolCall = roundContent.replace(/TOOL_CALL:.*$/m, "").trim();
        if (contentBeforeToolCall) {
          llmMessages.push({ role: "assistant", content: contentBeforeToolCall });
        }

        // Add tool result as user message for next round
        llmMessages.push({
          role: "user",
          content: `Tool result for ${toolCall.name}:\n${JSON.stringify(toolResult.result, null, 2)}`,
        });

        continue; // Next round
      }

      // No tool call — this is the final response. Stream it.
      const CHUNK_SIZE = 20;
      for (let i = 0; i < roundContent.length; i += CHUNK_SIZE) {
        const chunk = roundContent.slice(i, i + CHUNK_SIZE);
        sendSSE(res, "content_delta", { text: chunk });
      }
      fullContent = roundContent;
      break;
    }

    // 8. Extract citations from the response
    const citations = extractCitations(fullContent);
    for (const citation of citations) {
      sendSSE(res, "citation", citation);
    }

    // 9. Persist assistant message
    const assistantMsg = await db.copilotMessage.create({
      data: {
        threadId,
        role: "ASSISTANT",
        content: fullContent,
        toolTrace:
          toolTraces.length > 0 ? (toolTraces as unknown as Prisma.InputJsonValue) : undefined,
        citations:
          citations.length > 0 ? (citations as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    sendSSE(res, "done", { messageId: assistantMsg.id });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    sendSSE(res, "error", { message: errorMessage });
  } finally {
    res.end();
  }
}

// ── Citation extraction ───────────────────────────────────────────────

function extractCitations(content: string): Citation[] {
  const citations: Citation[] = [];
  // Match pattern: [Type: Title](id)
  const regex = /\[(Insight|Spec|Decision|Theme|Feedback):\s*([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    citations.push({
      type: match[1]!.toLowerCase(),
      id: match[3]!,
      title: match[2]!.trim(),
    });
  }

  // Deduplicate by id
  const seen = new Set<string>();
  return citations.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
