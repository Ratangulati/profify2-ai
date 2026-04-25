"use client";

import { useState, useEffect } from "react";
import { Check, X, Copy, RefreshCw, Loader2, MessageSquare, Zap, Ticket } from "lucide-react";

import { CopilotPanel } from "../copilot/CopilotPanel.js";

// ── Types ──────────────────────────────────────────────────────────────

interface AgentPanelProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
  aiOutput: { command: string; content: string } | null;
  onClearOutput: () => void;
}

interface TicketPreview {
  title: string;
  description: string;
  type: string;
  priority: string;
  labels: string[];
}

type TabId = "output" | "chat" | "tickets";

// ── Constants ──────────────────────────────────────────────────────────

const COMMAND_LABELS: Record<string, string> = {
  find_evidence: "Find Evidence",
  challenge: "Challenge",
  expand: "Expand",
  simplify: "Simplify",
  user_story: "User Stories",
  edge_cases: "Edge Cases",
};

// ── AI Output Tab ──────────────────────────────────────────────────────

function AIOutputView({
  output,
  onAccept,
  onReject,
  onCopy,
  onRetry,
}: {
  output: { command: string; content: string } | null;
  onAccept: () => void;
  onReject: () => void;
  onCopy: () => void;
  onRetry: () => void;
}) {
  if (!output) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <Zap className="text-primary/40 h-8 w-8" />
        <p className="text-xs font-medium">No output yet</p>
        <p className="text-[11px] leading-relaxed">
          Run a slash command or select text in the editor to see AI output here.
        </p>
      </div>
    );
  }

  const commandLabel = COMMAND_LABELS[output.command] ?? output.command;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <Zap className="text-primary h-3.5 w-3.5" />
        <span className="text-xs font-medium">{commandLabel}</span>
        <div className="flex-1" />
        <div className="flex gap-1">
          <button
            onClick={onCopy}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
            title="Copy to clipboard"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={onRetry}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
            title="Retry"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
          {output.content}
        </div>
      </div>

      {/* Action buttons */}
      <div className="border-border flex gap-2 border-t p-3">
        <button
          onClick={onAccept}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium"
        >
          <Check className="h-3 w-3" />
          Accept
        </button>
        <button
          onClick={onReject}
          className="border-border text-muted-foreground hover:bg-accent hover:text-foreground flex flex-1 items-center justify-center gap-1.5 rounded-md border py-1.5 text-xs font-medium"
        >
          <X className="h-3 w-3" />
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Ticket Preview Tab ─────────────────────────────────────────────────

function TicketPreviewView({
  workspaceId,
  projectId,
  apiBaseUrl,
}: {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}) {
  const [tickets, setTickets] = useState<TicketPreview[]>([]);
  const [generating, setGenerating] = useState(false);

  const priorityColors: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    MEDIUM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    LOW: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  };

  const typeIcons: Record<string, string> = {
    STORY: "📖",
    BUG: "🐛",
    TASK: "✅",
    SPIKE: "🔬",
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-3 py-2">
        <Ticket className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-xs font-medium">Ticket Preview</span>
        <div className="flex-1" />
        <button
          onClick={() => {
            // TODO: Generate tickets from current spec
            setGenerating(true);
            setTimeout(() => {
              setTickets([
                {
                  title: "Implement user authentication flow",
                  description: "As a user, I want to securely log in so I can access my workspace.",
                  type: "STORY",
                  priority: "HIGH",
                  labels: ["auth", "frontend"],
                },
                {
                  title: "Set up API rate limiting",
                  description: "Add rate limiting middleware to prevent abuse of API endpoints.",
                  type: "TASK",
                  priority: "MEDIUM",
                  labels: ["backend", "security"],
                },
                {
                  title: "Research SSO integration options",
                  description: "Investigate SAML/OIDC providers for enterprise SSO support.",
                  type: "SPIKE",
                  priority: "LOW",
                  labels: ["auth", "enterprise"],
                },
              ]);
              setGenerating(false);
            }, 1500);
          }}
          disabled={generating}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-[11px] disabled:opacity-50"
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Generate
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tickets.length === 0 && !generating && (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
            <Ticket className="h-8 w-8 opacity-30" />
            <p className="text-xs">Generate tickets from your spec</p>
            <p className="text-[10px]">Click Generate to create issue previews</p>
          </div>
        )}

        {generating && (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              <p className="text-muted-foreground text-xs">Generating tickets...</p>
            </div>
          </div>
        )}

        {!generating &&
          tickets.map((ticket, i) => (
            <div
              key={i}
              className="border-border hover:bg-accent/30 mb-2 rounded-lg border p-3 transition-colors"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm">{typeIcons[ticket.type] ?? "📋"}</span>
                <span className="flex-1 text-sm font-medium">{ticket.title}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    priorityColors[ticket.priority] ?? priorityColors.MEDIUM
                  }`}
                >
                  {ticket.priority}
                </span>
              </div>
              <p className="text-muted-foreground mb-2 text-xs leading-relaxed">
                {ticket.description}
              </p>
              <div className="flex gap-1">
                {ticket.labels.map((label) => (
                  <span
                    key={label}
                    className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── Main AgentPanel ────────────────────────────────────────────────────

export function AgentPanel({
  workspaceId,
  projectId,
  apiBaseUrl,
  aiOutput,
  onClearOutput,
}: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("output");
  const [copied, setCopied] = useState(false);

  // Switch to output tab when new AI output arrives
  useEffect(() => {
    if (aiOutput) {
      setActiveTab("output");
    }
  }, [aiOutput]);

  // Cmd+J to focus copilot
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setActiveTab("chat");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleAccept = () => {
    // Copy to clipboard for user to paste
    if (aiOutput) {
      navigator.clipboard.writeText(aiOutput.content);
    }
    onClearOutput();
  };

  const handleCopy = () => {
    if (aiOutput) {
      navigator.clipboard.writeText(aiOutput.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRetry = () => {
    // Retry would need to re-send the command — for now just clear
    // The user can re-trigger from the editor
    onClearOutput();
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "output", label: "Output", icon: <Zap className="h-3 w-3" /> },
    { id: "chat", label: "Copilot", icon: <MessageSquare className="h-3 w-3" /> },
    { id: "tickets", label: "Tickets", icon: <Ticket className="h-3 w-3" /> },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Tab selector */}
      <div className="border-border flex border-b">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === "output" && aiOutput && (
              <span className="bg-primary h-1.5 w-1.5 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "output" && (
          <AIOutputView
            output={aiOutput}
            onAccept={handleAccept}
            onReject={onClearOutput}
            onCopy={handleCopy}
            onRetry={handleRetry}
          />
        )}

        {activeTab === "chat" && (
          <CopilotPanel workspaceId={workspaceId} projectId={projectId} apiBaseUrl={apiBaseUrl} />
        )}

        {activeTab === "tickets" && (
          <TicketPreviewView
            workspaceId={workspaceId}
            projectId={projectId}
            apiBaseUrl={apiBaseUrl}
          />
        )}
      </div>
    </div>
  );
}
