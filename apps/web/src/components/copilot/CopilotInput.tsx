"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, Paperclip, Loader2 } from "lucide-react";

import { MentionPopover } from "./MentionPopover.js";

interface Mention {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface CopilotInputProps {
  onSend: (message: string, mentions: Mention[]) => void;
  disabled?: boolean;
  loading?: boolean;
  apiBaseUrl: string;
  workspaceId: string;
  projectId: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export function CopilotInput({
  onSend,
  disabled,
  loading,
  apiBaseUrl,
  workspaceId,
  projectId,
  inputRef: externalRef,
}: CopilotInputProps) {
  const [value, setValue] = useState("");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionVisible, setMentionVisible] = useState(false);
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef ?? internalRef;

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value, textareaRef]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled || loading) return;
    onSend(trimmed, mentions);
    setValue("");
    setMentions([]);
  }, [value, mentions, disabled, loading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !mentionVisible) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      // Only trigger if @ is at start or preceded by whitespace, and no spaces in query
      const charBefore = atIndex > 0 ? newValue[atIndex - 1] : " ";
      if (
        (charBefore === " " || charBefore === "\n" || atIndex === 0) &&
        !textAfterAt.includes(" ")
      ) {
        setMentionQuery(textAfterAt);
        setMentionStartIndex(atIndex);
        setMentionVisible(true);
        // Position popover above the textarea
        setMentionPosition({ top: -200, left: 0 });
        return;
      }
    }

    setMentionVisible(false);
  };

  const handleMentionSelect = useCallback(
    (result: { type: "spec" | "insight" | "theme" | "decision"; id: string; title: string }) => {
      setMentions((prev) => [...prev, result]);

      // Replace @query with @[Title]
      const before = value.slice(0, mentionStartIndex);
      const after = value.slice(mentionStartIndex + 1 + mentionQuery.length);
      setValue(`${before}@[${result.title}] ${after}`);
      setMentionVisible(false);
      textareaRef.current?.focus();
    },
    [value, mentionStartIndex, mentionQuery, textareaRef],
  );

  return (
    <div className="border-border relative border-t p-2">
      {/* Mention chips */}
      {mentions.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1 px-1">
          {mentions.map((m, i) => (
            <span
              key={`${m.id}-${i}`}
              className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            >
              @{m.title}
              <button
                onClick={() => setMentions((prev) => prev.filter((_, j) => j !== i))}
                className="hover:text-primary/70 ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your project... (@ to mention)"
          rows={1}
          disabled={disabled}
          className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring flex-1 resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
          style={{ maxHeight: 120 }}
        />
        <button
          onClick={handleSend}
          disabled={!value.trim() || disabled || loading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-8 w-8 shrink-0 items-center justify-center rounded-md disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Mention popover */}
      <MentionPopover
        query={mentionQuery}
        visible={mentionVisible}
        position={mentionPosition}
        apiBaseUrl={apiBaseUrl}
        workspaceId={workspaceId}
        projectId={projectId}
        onSelect={handleMentionSelect}
        onClose={() => setMentionVisible(false)}
      />
    </div>
  );
}
