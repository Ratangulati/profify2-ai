"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Loader2 } from "lucide-react";

import { CopilotInput } from "./CopilotInput.js";
import { CommandChips } from "./CommandChips.js";
import { MessageBubble, type CopilotMessage } from "./MessageBubble.js";

// ── Types ──────────────────────────────────────────────────────────────

interface CopilotPanelProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  activeSpecId?: string;
  activeSpecTitle?: string;
}

interface Mention {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface ToolTrace {
  tool: string;
  input: Record<string, string>;
  results?: number;
  durationMs: number;
}

// ── Component ─────────────────────────────────────────────────────────

export function CopilotPanel({
  workspaceId,
  projectId,
  apiBaseUrl,
  activeSpecId,
  activeSpecTitle,
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingTraces, setStreamingTraces] = useState<ToolTrace[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}`;

  // ── Load existing threads on mount ──────────────────────────────────

  useEffect(() => {
    async function loadThread() {
      try {
        const res = await fetch(`${base}/copilot/threads`, {
          credentials: "include",
        });
        const json = await res.json();

        if (json.success && json.data.threads.length > 0) {
          const latest = json.data.threads[0];
          setThreadId(latest.id);

          // Load messages
          const msgRes = await fetch(`${base}/copilot/threads/${latest.id}/messages?limit=50`, {
            credentials: "include",
          });
          const msgJson = await msgRes.json();

          if (msgJson.success) {
            setMessages(msgJson.data.messages);
          }
        }
      } catch {
        // Silent fail — no threads yet is fine
      } finally {
        setInitializing(false);
      }
    }

    loadThread();
  }, [base]);

  // ── Auto-scroll ─────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // ── Send message ────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (message: string, mentions: Mention[]) => {
      if (loading) return;

      // Optimistic user message
      const userMsg: CopilotMessage = {
        id: `temp-${Date.now()}`,
        role: "USER",
        content: message,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setStreamingContent("");
      setStreamingTraces([]);

      // Abort previous stream if any
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`${base}/copilot/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            mentions,
            activeContext: activeSpecId
              ? { specId: activeSpecId, specTitle: activeSpecTitle }
              : null,
            threadId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        // Read SSE stream
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let accumulatedTraces: ToolTrace[] = [];
        let messageId = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let currentEvent = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7);
            } else if (line.startsWith("data: ")) {
              const currentData = line.slice(6);

              try {
                const parsed = JSON.parse(currentData);

                switch (currentEvent) {
                  case "thread_created":
                    setThreadId(parsed.threadId);
                    break;

                  case "tool_start":
                    // Show tool in progress
                    break;

                  case "tool_result":
                    accumulatedTraces = [
                      ...accumulatedTraces,
                      {
                        tool: parsed.tool,
                        input: {},
                        results: parsed.results,
                        durationMs: parsed.durationMs,
                      },
                    ];
                    setStreamingTraces([...accumulatedTraces]);
                    break;

                  case "content_delta":
                    accumulatedContent += parsed.text;
                    setStreamingContent(accumulatedContent);
                    break;

                  case "citation":
                    // Citations are collected; they'll be on the final message
                    break;

                  case "done":
                    messageId = parsed.messageId;
                    break;

                  case "error":
                    throw new Error(parsed.message);
                }
              } catch (e) {
                if (e instanceof Error && e.message !== currentData) throw e;
                // Ignore JSON parse errors on partial data
              }
            }
          }
        }

        // Replace streaming state with final message
        if (messageId && accumulatedContent) {
          // Reload the actual persisted message to get citations
          const currentThreadId = threadId;
          if (currentThreadId) {
            const msgRes = await fetch(
              `${base}/copilot/threads/${currentThreadId}/messages?limit=1`,
              { credentials: "include" },
            );
            const msgJson = await msgRes.json();
            const finalMsg = msgJson.success
              ? msgJson.data.messages[msgJson.data.messages.length - 1]
              : null;

            if (finalMsg) {
              setMessages((prev) => [...prev, finalMsg]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: messageId,
                  role: "ASSISTANT",
                  content: accumulatedContent,
                  toolTrace: accumulatedTraces,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: messageId,
                role: "ASSISTANT",
                content: accumulatedContent,
                toolTrace: accumulatedTraces,
                createdAt: new Date().toISOString(),
              },
            ]);
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;

        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "ASSISTANT",
            content:
              err instanceof Error
                ? `Error: ${err.message}`
                : "Failed to get a response. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setLoading(false);
        setStreamingContent("");
        setStreamingTraces([]);
      }
    },
    [loading, base, threadId, activeSpecId, activeSpecTitle],
  );

  // ── Feedback handler ────────────────────────────────────────────────

  const handleFeedback = useCallback(
    async (messageId: string, feedback: "POSITIVE" | "NEGATIVE" | null) => {
      try {
        await fetch(`${base}/copilot/messages/${messageId}/feedback`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback }),
        });

        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
      } catch {
        // Silent fail
      }
    },
    [base],
  );

  // ── Command chip handler ────────────────────────────────────────────

  const handleCommand = useCallback((prompt: string) => {
    const textarea = inputRef.current;
    if (textarea) {
      // Set value via native setter to trigger React's onChange
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(textarea, prompt);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.focus();
      // Place cursor at end
      textarea.setSelectionRange(prompt.length, prompt.length);
    }
  }, []);

  // ── Render ──────────────────────────────────────────────────────────

  if (initializing) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && !loading && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <Bot className="h-8 w-8 opacity-30" />
            <p className="text-xs">Ask anything about your project</p>
            <CommandChips onSelect={handleCommand} />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onFeedback={msg.role === "ASSISTANT" ? handleFeedback : undefined}
            onInsertToSpec={
              msg.role === "ASSISTANT"
                ? (content) => navigator.clipboard.writeText(content)
                : undefined
            }
          />
        ))}

        {/* Streaming message */}
        {loading && streamingContent && (
          <MessageBubble
            message={{
              id: "streaming",
              role: "ASSISTANT",
              content: streamingContent,
              createdAt: new Date().toISOString(),
            }}
            isStreaming
            streamingToolTraces={streamingTraces}
          />
        )}

        {/* Loading indicator when no content yet */}
        {loading && !streamingContent && (
          <div className="mb-4 flex gap-2">
            <div className="bg-primary/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
              <Bot className="text-primary h-3 w-3" />
            </div>
            <div className="bg-muted rounded-lg px-3 py-2">
              {streamingTraces.length > 0 ? (
                <span className="text-muted-foreground text-xs">
                  {streamingTraces.map((t) => t.tool).join(", ")}...
                </span>
              ) : (
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Command chips after response completes */}
      {messages.length > 0 && !loading && (
        <div className="px-3 pb-1">
          <CommandChips onSelect={handleCommand} />
        </div>
      )}

      {/* Input */}
      <CopilotInput
        onSend={sendMessage}
        disabled={false}
        loading={loading}
        apiBaseUrl={apiBaseUrl}
        workspaceId={workspaceId}
        projectId={projectId}
        inputRef={inputRef}
      />
    </div>
  );
}
