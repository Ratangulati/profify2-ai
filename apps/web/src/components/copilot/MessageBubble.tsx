"use client";

import { useState } from "react";
import {
  Bot,
  User,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Search,
} from "lucide-react";

import { CitationChip } from "./CitationChip.js";

// ── Types ──────────────────────────────────────────────────────────────

interface ToolTrace {
  tool: string;
  input: Record<string, string>;
  results?: number;
  durationMs: number;
}

interface Citation {
  type: string;
  id: string;
  title: string;
  quote?: string;
}

export interface CopilotMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  toolTrace?: ToolTrace[] | null;
  citations?: Citation[] | null;
  feedback?: "POSITIVE" | "NEGATIVE" | null;
  createdAt: string;
}

interface MessageBubbleProps {
  message: CopilotMessage;
  isStreaming?: boolean;
  streamingToolTraces?: ToolTrace[];
  onFeedback?: (messageId: string, feedback: "POSITIVE" | "NEGATIVE" | null) => void;
  onInsertToSpec?: (content: string) => void;
}

// ── Tool trace summary ────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  search_insights: "Searched insights",
  search_feedback: "Searched feedback",
  get_decisions: "Looked up decisions",
  lookup_spec: "Loaded spec",
  get_analytics: "Checked analytics",
};

function ToolTraceSection({ traces }: { traces: ToolTrace[] }) {
  const [expanded, setExpanded] = useState(false);

  if (traces.length === 0) return null;

  const summary = traces
    .map((t) => {
      const label = TOOL_LABELS[t.tool] ?? t.tool;
      return t.results !== undefined ? `${label} (${t.results} results)` : label;
    })
    .join(", ");

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-[10px]"
      >
        <Search className="h-2.5 w-2.5" />
        {expanded ? (
          <ChevronDown className="h-2.5 w-2.5" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" />
        )}
        <span>{summary}</span>
      </button>

      {expanded && (
        <div className="border-border mt-1 space-y-1 border-l-2 pl-2">
          {traces.map((trace, i) => (
            <div key={i} className="text-muted-foreground text-[10px]">
              <span className="font-medium">{trace.tool}</span>
              <span className="ml-1">({trace.durationMs}ms)</span>
              {trace.input && (
                <span className="text-muted-foreground/70 ml-1">
                  {Object.entries(trace.input)
                    .map(([k, v]) => `${k}="${v}"`)
                    .join(", ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function MessageBubble({
  message,
  isStreaming,
  streamingToolTraces,
  onFeedback,
  onInsertToSpec,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "USER";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const traces = streamingToolTraces ?? (message.toolTrace as ToolTrace[] | null) ?? [];
  const citations = (message.citations as Citation[] | null) ?? [];

  return (
    <div className={`mb-4 flex gap-2 ${isUser ? "justify-end" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="bg-primary/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
          <Bot className="text-primary h-3 w-3" />
        </div>
      )}

      <div className={`max-w-[85%] ${isUser ? "" : "flex-1"}`}>
        {/* Tool traces (assistant only) */}
        {!isUser && traces.length > 0 && <ToolTraceSection traces={traces} />}

        {/* Message content */}
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          <div className="whitespace-pre-wrap leading-relaxed">
            {message.content}
            {isStreaming && (
              <span className="bg-foreground/50 inline-block h-4 w-1 animate-pulse" />
            )}
          </div>
        </div>

        {/* Citations */}
        {!isUser && citations.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {citations.map((c) => (
              <CitationChip key={c.id} type={c.type} id={c.id} title={c.title} />
            ))}
          </div>
        )}

        {/* Actions (assistant only, not while streaming) */}
        {!isUser && !isStreaming && message.content && (
          <div className="mt-1.5 flex items-center gap-1">
            <button
              onClick={handleCopy}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 items-center gap-1 rounded px-1.5 text-[10px]"
              title="Copy"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>

            {onInsertToSpec && (
              <button
                onClick={() => onInsertToSpec(message.content)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 items-center gap-1 rounded px-1.5 text-[10px]"
                title="Insert into spec"
              >
                <ClipboardPaste className="h-3 w-3" />
              </button>
            )}

            {onFeedback && (
              <>
                <button
                  onClick={() =>
                    onFeedback(message.id, message.feedback === "POSITIVE" ? null : "POSITIVE")
                  }
                  className={`flex h-6 items-center rounded px-1.5 text-[10px] ${
                    message.feedback === "POSITIVE"
                      ? "text-emerald-600"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Good response"
                >
                  <ThumbsUp className="h-3 w-3" />
                </button>
                <button
                  onClick={() =>
                    onFeedback(message.id, message.feedback === "NEGATIVE" ? null : "NEGATIVE")
                  }
                  className={`flex h-6 items-center rounded px-1.5 text-[10px] ${
                    message.feedback === "NEGATIVE"
                      ? "text-red-600"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  title="Bad response"
                >
                  <ThumbsDown className="h-3 w-3" />
                </button>
              </>
            )}

            {/* Timestamp */}
            <span className="text-muted-foreground ml-auto text-[10px]">
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
          <User className="text-muted-foreground h-3 w-3" />
        </div>
      )}
    </div>
  );
}
