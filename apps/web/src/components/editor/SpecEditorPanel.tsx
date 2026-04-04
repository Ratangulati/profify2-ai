"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  X,
  FileText,
  Plus,
  Save,
  Loader2,
  ChevronDown,
  Search,
  Zap,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  Shield,
  Wand2,
  ListChecks,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────

interface OpenSpec {
  id: string;
  title: string;
  status: string;
  content: string;
  dirty: boolean;
}

interface SlashMenuItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  command: string;
}

interface SpecEditorPanelProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  onAICommand: (command: string, content: string) => void;
}

// ── Slash Command Menu Items ───────────────────────────────────────────

const SLASH_COMMANDS: SlashMenuItem[] = [
  {
    id: "evidence",
    label: "Find Evidence",
    description: "Search for supporting evidence",
    icon: <Search className="h-4 w-4" />,
    command: "find_evidence",
  },
  {
    id: "challenge",
    label: "Challenge",
    description: "Challenge this assumption or claim",
    icon: <Shield className="h-4 w-4" />,
    command: "challenge",
  },
  {
    id: "expand",
    label: "Expand",
    description: "Expand on this section with more detail",
    icon: <BookOpen className="h-4 w-4" />,
    command: "expand",
  },
  {
    id: "simplify",
    label: "Simplify",
    description: "Simplify this text for clarity",
    icon: <Wand2 className="h-4 w-4" />,
    command: "simplify",
  },
  {
    id: "user-story",
    label: "User Story",
    description: "Generate user stories from context",
    icon: <ListChecks className="h-4 w-4" />,
    command: "user_story",
  },
  {
    id: "edge-cases",
    label: "Edge Cases",
    description: "Identify edge cases and failure modes",
    icon: <AlertCircle className="h-4 w-4" />,
    command: "edge_cases",
  },
];

// ── Slash Command Menu Component ───────────────────────────────────────

function SlashCommandMenu({
  query,
  position,
  onSelect,
  onClose,
}: {
  query: string;
  position: { top: number; left: number };
  onSelect: (item: SlashMenuItem) => void;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      SLASH_COMMANDS.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.id.includes(query.toLowerCase()),
      ),
    [query],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="border-border bg-popover fixed z-50 w-64 overflow-hidden rounded-lg border shadow-lg"
      style={{ top: position.top, left: position.left }}
    >
      <div className="p-1">
        {filtered.map((item, index) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-accent/50"
            }`}
          >
            <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded">
              {item.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{item.label}</div>
              <div className="text-muted-foreground truncate text-xs">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Citation Badge (inline in editor) ──────────────────────────────────

function CitationBadge({
  citationRef,
  evidenceType,
}: {
  citationRef: string;
  evidenceType: string;
}) {
  const typeColors: Record<string, string> = {
    INSIGHT: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
    PAIN_POINT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    FEEDBACK: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
    COMPETITIVE: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    JTBD: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    ANALYTICS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  };

  const colorClass = typeColors[evidenceType] ?? typeColors.INSIGHT;

  return (
    <span
      className={`inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${colorClass}`}
      title={`Evidence: ${citationRef}`}
    >
      <Lightbulb className="h-2.5 w-2.5" />
      {citationRef}
    </span>
  );
}

// ── Assumption Callout ─────────────────────────────────────────────────

function AssumptionCallout({
  children,
  riskLevel,
}: {
  children: React.ReactNode;
  riskLevel?: string;
}) {
  const riskColors: Record<string, string> = {
    LOW: "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20",
    MEDIUM: "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20",
    HIGH: "border-orange-400 bg-orange-50 dark:border-orange-600 dark:bg-orange-900/20",
    CRITICAL: "border-red-400 bg-red-50 dark:border-red-600 dark:bg-red-900/20",
  };

  const colorClass = riskColors[riskLevel ?? "MEDIUM"] ?? riskColors.MEDIUM;

  return (
    <div className={`my-2 rounded-lg border-l-4 p-3 ${colorClass}`}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" />
        Assumption
        {riskLevel && (
          <span className="rounded bg-amber-200/50 px-1 text-[10px] dark:bg-amber-800/50">
            {riskLevel}
          </span>
        )}
      </div>
      <div className="text-sm text-amber-900 dark:text-amber-100">{children}</div>
    </div>
  );
}

// ── Open Question Callout ──────────────────────────────────────────────

function OpenQuestionCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-lg border-l-4 border-blue-400 bg-blue-50 p-3 dark:border-blue-600 dark:bg-blue-900/20">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
        <HelpCircle className="h-3 w-3" />
        Open Question
      </div>
      <div className="text-sm text-blue-900 dark:text-blue-100">{children}</div>
    </div>
  );
}

// ── Tab Bar ────────────────────────────────────────────────────────────

function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
}: {
  tabs: OpenSpec[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="border-border bg-muted/30 flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          className={`border-border group flex h-full items-center gap-1.5 border-r px-3 text-xs transition-colors ${
            tab.id === activeId
              ? "bg-background text-foreground"
              : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
          }`}
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="max-w-[120px] truncate">{tab.title}</span>
          {tab.dirty && <span className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.id);
            }}
            className="text-muted-foreground hover:bg-accent hover:text-foreground ml-1 hidden h-4 w-4 shrink-0 items-center justify-center rounded group-hover:flex"
          >
            <X className="h-3 w-3" />
          </button>
        </button>
      ))}
      <button
        onClick={onNew}
        className="text-muted-foreground hover:bg-background/50 hover:text-foreground flex h-full items-center px-2"
        title="New spec"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Editor Toolbar ─────────────────────────────────────────────────────

function EditorToolbar({
  saving,
  dirty,
  status,
  onSave,
  onStatusChange,
}: {
  saving: boolean;
  dirty: boolean;
  status: string;
  onSave: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [showStatus, setShowStatus] = useState(false);

  const statusConfig: Record<string, { label: string; class: string }> = {
    DRAFT: { label: "Draft", class: "bg-muted text-muted-foreground" },
    REVIEW: {
      label: "In Review",
      class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    APPROVED: {
      label: "Approved",
      class: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    ARCHIVED: { label: "Archived", class: "bg-muted text-muted-foreground" },
  };

  const currentStatus = statusConfig[status] ?? statusConfig.DRAFT;

  return (
    <div className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
      {/* Status */}
      <div className="relative">
        <button
          onClick={() => setShowStatus(!showStatus)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${currentStatus.class}`}
        >
          {currentStatus.label}
          <ChevronDown className="h-3 w-3" />
        </button>
        {showStatus && (
          <div className="border-border bg-popover absolute left-0 top-full z-40 mt-1 w-32 rounded-md border p-1 shadow-lg">
            {Object.entries(statusConfig).map(([key, { label, class: cls }]) => (
              <button
                key={key}
                onClick={() => {
                  onStatusChange(key);
                  setShowStatus(false);
                }}
                className={`hover:bg-accent flex w-full items-center rounded px-2 py-1 text-xs ${
                  key === status ? "font-medium" : ""
                }`}
              >
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${cls}`} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Save */}
      <button
        onClick={onSave}
        disabled={!dirty || saving}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          dirty
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        {saving ? "Saving..." : dirty ? "Save" : "Saved"}
      </button>

      <span className="text-muted-foreground text-[10px]">
        <kbd className="border-border bg-muted rounded border px-1">⌘S</kbd>
      </span>
    </div>
  );
}

// ── Main SpecEditorPanel ───────────────────────────────────────────────

export function SpecEditorPanel({
  workspaceId,
  projectId,
  apiBaseUrl,
  onAICommand,
}: SpecEditorPanelProps) {
  const [openSpecs, setOpenSpecs] = useState<OpenSpec[]>([]);
  const [activeSpecId, setActiveSpecId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slash command state
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const slashStartPos = useRef<number | null>(null);

  const base = `${apiBaseUrl}/api/workspaces/${workspaceId}`;

  const activeSpec = useMemo(
    () => openSpecs.find((s) => s.id === activeSpecId) ?? null,
    [openSpecs, activeSpecId],
  );

  // TipTap editor
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
        }),
        Placeholder.configure({
          placeholder: 'Start writing your spec... Type "/" for AI commands',
        }),
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
      ],
      content: activeSpec?.content ?? "",
      editorProps: {
        attributes: {
          class:
            "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[calc(100vh-12rem)] px-8 py-6",
        },
        handleKeyDown: (_view, event) => {
          // Detect "/" for slash commands
          if (event.key === "/" && !slashMenuOpen) {
            // Delay to let the character be inserted
            setTimeout(() => {
              const { state } = editor!;
              const { from } = state.selection;
              slashStartPos.current = from;

              // Get cursor position for menu placement
              const coords = editor!.view.coordsAtPos(from);
              setSlashPosition({
                top: coords.bottom + 4,
                left: coords.left,
              });
              setSlashMenuOpen(true);
              setSlashQuery("");
            }, 10);
            return false;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        // Track slash command query
        if (slashMenuOpen && slashStartPos.current !== null) {
          const { from } = ed.state.selection;
          const text = ed.state.doc.textBetween(slashStartPos.current, from, "");
          if (text.startsWith("/")) {
            setSlashQuery(text.slice(1));
          } else {
            setSlashMenuOpen(false);
            slashStartPos.current = null;
          }
        }

        // Mark spec as dirty
        if (activeSpecId) {
          const html = ed.getHTML();
          setOpenSpecs((prev) =>
            prev.map((s) => (s.id === activeSpecId ? { ...s, content: html, dirty: true } : s)),
          );
        }
      },
    },
    [activeSpecId],
  );

  // Handle slash command selection
  const handleSlashSelect = useCallback(
    (item: SlashMenuItem) => {
      if (!editor || slashStartPos.current === null) return;

      // Remove the slash text from the editor
      const { from } = editor.state.selection;
      editor
        .chain()
        .focus()
        .deleteRange({ from: slashStartPos.current - 1, to: from })
        .run();

      setSlashMenuOpen(false);
      slashStartPos.current = null;

      // Get selected text or current paragraph as context
      const { state } = editor;
      const { from: selFrom, to: selTo } = state.selection;
      const selectedText = state.doc.textBetween(selFrom, selTo, " ");
      const paragraphText = selectedText || editor.getText().slice(0, 500);

      // Send to AI panel
      onAICommand(item.command, paragraphText);
    },
    [editor, onAICommand],
  );

  // Cmd+S save shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (activeSpec?.dirty) {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeSpec]);

  // Load spec list on mount
  useEffect(() => {
    loadSpecsList();
  }, []);

  const loadSpecsList = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/projects/${projectId}/specs?limit=20`, {
        credentials: "include",
      });
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        const first = json.data[0];
        openSpec(first.id, first.title, first.status);
      }
    } catch {
      // Silently handle — empty state shown
    } finally {
      setLoading(false);
    }
  };

  const openSpec = async (id: string, title: string, status: string) => {
    // If already open, just switch to it
    const existing = openSpecs.find((s) => s.id === id);
    if (existing) {
      setActiveSpecId(id);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${base}/specs/${id}`, {
        credentials: "include",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");

      const content =
        json.data.content?.sections
          ?.map((s: { title: string; content: string }) => `<h2>${s.title}</h2>${s.content}`)
          .join("") ?? "<p></p>";

      const newSpec: OpenSpec = {
        id,
        title: json.data.title ?? title,
        status: json.data.status ?? status,
        content,
        dirty: false,
      };

      setOpenSpecs((prev) => [...prev, newSpec]);
      setActiveSpecId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spec");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!activeSpec || !activeSpec.dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${base}/specs/${activeSpec.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { html: activeSpec.content },
          changeNote: "Manual edit",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Save failed");

      setOpenSpecs((prev) =>
        prev.map((s) => (s.id === activeSpec.id ? { ...s, dirty: false } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!activeSpec) return;
    try {
      await fetch(`${base}/specs/${activeSpec.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setOpenSpecs((prev) => prev.map((s) => (s.id === activeSpec.id ? { ...s, status } : s)));
    } catch {
      // Silently handle
    }
  };

  const handleCloseTab = (id: string) => {
    setOpenSpecs((prev) => prev.filter((s) => s.id !== id));
    if (activeSpecId === id) {
      const remaining = openSpecs.filter((s) => s.id !== id);
      setActiveSpecId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  };

  const handleNewSpec = () => {
    const tempId = `new-${Date.now()}`;
    const newSpec: OpenSpec = {
      id: tempId,
      title: "Untitled Spec",
      status: "DRAFT",
      content: "<h1>Untitled Spec</h1><p></p>",
      dirty: true,
    };
    setOpenSpecs((prev) => [...prev, newSpec]);
    setActiveSpecId(tempId);
  };

  // BubbleMenu AI commands
  const handleBubbleAICommand = useCallback(
    (command: string) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, " ");
      if (!selectedText.trim()) return;
      onAICommand(command, selectedText);
    },
    [editor, onAICommand],
  );

  // Handle evidence drop from left panel
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const data = e.dataTransfer.getData("application/pm-evidence");
      if (!data || !editor) return;

      try {
        const evidence = JSON.parse(data);
        const citationText = `[Evidence: ${evidence.id}]`;

        // Insert citation at drop position
        editor
          .chain()
          .focus()
          .insertContent(
            `<span data-type="citation" data-citation-ref="${evidence.id}" data-evidence-type="${evidence.type ?? "INSIGHT"}">${citationText}</span> `,
          )
          .run();

        if (activeSpecId) {
          setOpenSpecs((prev) =>
            prev.map((s) => (s.id === activeSpecId ? { ...s, dirty: true } : s)),
          );
        }
      } catch {
        // Invalid drop data
      }
    },
    [editor, activeSpecId],
  );

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/pm-evidence")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <TabBar
        tabs={openSpecs}
        activeId={activeSpecId}
        onSelect={setActiveSpecId}
        onClose={handleCloseTab}
        onNew={handleNewSpec}
      />

      {/* Toolbar */}
      {activeSpec && (
        <EditorToolbar
          saving={saving}
          dirty={activeSpec.dirty}
          status={activeSpec.status}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Error bar */}
      {error && (
        <div className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-b px-3 py-1.5 text-xs">
          <AlertTriangle className="h-3 w-3" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto" onDrop={handleDrop} onDragOver={handleDragOver}>
        {loading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        )}

        {!loading && !activeSpec && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">No spec open</p>
            <p className="text-xs">Open a spec from the command palette (⌘K) or create a new one</p>
            <button
              onClick={handleNewSpec}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium"
            >
              <Plus className="h-3 w-3" />
              New Spec
            </button>
          </div>
        )}

        {!loading && activeSpec && editor && (
          <>
            {/* BubbleMenu for selection-based AI commands */}
            <BubbleMenu editor={editor} tippyOptions={{ duration: 100, placement: "top" }}>
              <div className="border-border bg-popover flex gap-0.5 rounded-lg border p-1 shadow-lg">
                {[
                  { cmd: "find_evidence", label: "Evidence", icon: <Search className="h-3 w-3" /> },
                  { cmd: "challenge", label: "Challenge", icon: <Zap className="h-3 w-3" /> },
                  { cmd: "expand", label: "Expand", icon: <BookOpen className="h-3 w-3" /> },
                  { cmd: "simplify", label: "Simplify", icon: <Wand2 className="h-3 w-3" /> },
                ].map(({ cmd, label, icon }) => (
                  <button
                    key={cmd}
                    onClick={() => handleBubbleAICommand(cmd)}
                    className="text-popover-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs"
                    title={label}
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </BubbleMenu>

            <EditorContent editor={editor} />
          </>
        )}
      </div>

      {/* Slash command menu */}
      {slashMenuOpen && (
        <SlashCommandMenu
          query={slashQuery}
          position={slashPosition}
          onSelect={handleSlashSelect}
          onClose={() => {
            setSlashMenuOpen(false);
            slashStartPos.current = null;
          }}
        />
      )}
    </div>
  );
}
