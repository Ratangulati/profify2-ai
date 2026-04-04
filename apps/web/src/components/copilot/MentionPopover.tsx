"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Lightbulb, GitBranch, Layers } from "lucide-react";

interface MentionResult {
  type: "spec" | "insight" | "theme" | "decision";
  id: string;
  title: string;
}

interface MentionPopoverProps {
  query: string;
  visible: boolean;
  position: { top: number; left: number };
  apiBaseUrl: string;
  workspaceId: string;
  projectId: string;
  onSelect: (result: MentionResult) => void;
  onClose: () => void;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  spec: FileText,
  insight: Lightbulb,
  theme: Layers,
  decision: GitBranch,
};

const TYPE_LABELS: Record<string, string> = {
  spec: "Spec",
  insight: "Insight",
  theme: "Theme",
  decision: "Decision",
};

export function MentionPopover({
  query,
  visible,
  position,
  apiBaseUrl,
  workspaceId,
  projectId,
  onSelect,
  onClose,
}: MentionPopoverProps) {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const search = useCallback(
    async (q: string) => {
      if (q.length < 1) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(
          `${apiBaseUrl}/api/workspaces/${workspaceId}/projects/${projectId}/copilot/mentions/search`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: q }),
          },
        );
        const json = await res.json();
        if (json.success) {
          setResults(json.data.results);
          setSelectedIndex(0);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [apiBaseUrl, workspaceId, projectId],
  );

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, visible, search]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        onSelect(results[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, results, selectedIndex, onSelect, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="border-border bg-popover absolute z-50 w-64 rounded-lg border shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      {loading && results.length === 0 && (
        <div className="text-muted-foreground px-3 py-2 text-xs">Searching...</div>
      )}

      {!loading && results.length === 0 && query.length > 0 && (
        <div className="text-muted-foreground px-3 py-2 text-xs">No results found</div>
      )}

      {results.map((result, i) => {
        const Icon = TYPE_ICONS[result.type] ?? FileText;
        return (
          <button
            key={`${result.type}-${result.id}`}
            onClick={() => onSelect(result)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
              i === selectedIndex
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">{result.title}</span>
            <span className="text-muted-foreground text-[10px]">{TYPE_LABELS[result.type]}</span>
          </button>
        );
      })}
    </div>
  );
}
