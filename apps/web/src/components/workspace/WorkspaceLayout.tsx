"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { TopNav } from "./TopNav";
import { CommandPalette } from "./CommandPalette";
import { EvidenceExplorer } from "./EvidenceExplorer";
import { SpecEditorPanel } from "../editor/SpecEditorPanel";
import { AgentPanel } from "./AgentPanel";
import { AppSidebar, type ViewKey } from "./AppSidebar";
import { InsightList } from "../insights/InsightList";
import { PrioritizationTable } from "../opportunities/PrioritizationTable";
import { TrendChart } from "../trends/TrendChart";
import { CompetitiveDashboard } from "../competitive/CompetitiveDashboard";

interface WorkspaceLayoutProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

export function WorkspaceLayout({ workspaceId, projectId, apiBaseUrl }: WorkspaceLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>("evidence");

  const rightPanelRef = useRef<{ expand: () => void; collapse: () => void } | null>(null);

  const [aiOutput, setAIOutput] = useState<{ command: string; content: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "3") {
        e.preventDefault();
        if (rightCollapsed) {
          rightPanelRef.current?.expand();
          setRightCollapsed(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightCollapsed]);

  const handleAICommand = useCallback(
    (command: string, content: string) => {
      setAIOutput({ command, content });
      if (rightCollapsed) {
        rightPanelRef.current?.expand();
        setRightCollapsed(false);
      }
    },
    [rightCollapsed],
  );

  return (
    <div className="bg-background text-foreground flex h-screen flex-col">
      <TopNav
        workspaceId={workspaceId}
        projectId={projectId}
        onCommandPalette={() => setCommandPaletteOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <AppSidebar activeView={activeView} onViewChange={setActiveView} />

        <PanelGroup direction="horizontal" className="flex-1">
          {/* Left Panel — view determined by activeView */}
          <Panel defaultSize={25} minSize={15}>
            <div className="border-border flex h-full flex-col border-r">
              <PanelHeader title={activeView.charAt(0).toUpperCase() + activeView.slice(1)} />
              <div className="flex-1 overflow-hidden">
                <LeftPanelContent
                  activeView={activeView}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  apiBaseUrl={apiBaseUrl}
                />
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          {/* Center Panel — Spec Editor */}
          <Panel defaultSize={50} minSize={30}>
            <div className="flex h-full flex-col">
              <SpecEditorPanel
                workspaceId={workspaceId}
                projectId={projectId}
                apiBaseUrl={apiBaseUrl}
                onAICommand={handleAICommand}
              />
            </div>
          </Panel>

          {/* Right collapsed indicator */}
          {rightCollapsed && (
            <button
              onClick={() => {
                rightPanelRef.current?.expand();
                setRightCollapsed(false);
              }}
              className="border-border bg-muted/30 hover:bg-muted flex w-8 shrink-0 items-center justify-center border-l"
              title="Expand Agent panel (⌘3)"
            >
              <PanelRightOpen className="text-muted-foreground h-3.5 w-3.5" />
            </button>
          )}

          {!rightCollapsed && <ResizeHandle />}

          {/* Right Panel — Agent Output */}
          <Panel
            ref={rightPanelRef as never}
            defaultSize={25}
            minSize={15}
            collapsible
            collapsedSize={0}
            onCollapse={() => setRightCollapsed(true)}
            onExpand={() => setRightCollapsed(false)}
            className={rightCollapsed ? "hidden" : ""}
          >
            <div className="border-border flex h-full flex-col border-l">
              <PanelHeader
                title="Agent"
                action={
                  <button
                    onClick={() => {
                      rightPanelRef.current?.collapse();
                    }}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
                    title="Collapse Agent panel"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <div className="flex-1 overflow-hidden">
                <AgentPanel
                  workspaceId={workspaceId}
                  projectId={projectId}
                  apiBaseUrl={apiBaseUrl}
                  aiOutput={aiOutput}
                  onClearOutput={() => setAIOutput(null)}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        workspaceId={workspaceId}
        projectId={projectId}
        apiBaseUrl={apiBaseUrl}
      />
    </div>
  );
}

// ── Left panel content router ────────────────────────────────────────

function LeftPanelContent({
  activeView,
  workspaceId,
  projectId,
  apiBaseUrl,
}: {
  activeView: ViewKey;
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}) {
  switch (activeView) {
    case "evidence":
      return (
        <EvidenceExplorer workspaceId={workspaceId} projectId={projectId} apiBaseUrl={apiBaseUrl} />
      );
    case "specs":
      return <SpecListStub />;
    case "insights":
      return (
        <InsightList workspaceId={workspaceId} projectId={projectId} apiBaseUrl={apiBaseUrl} />
      );
    case "opportunities":
      return (
        <PrioritizationTable
          workspaceId={workspaceId}
          projectId={projectId}
          apiBaseUrl={apiBaseUrl}
        />
      );
    case "trends":
      return <TrendChart workspaceId={workspaceId} projectId={projectId} apiBaseUrl={apiBaseUrl} />;
    case "competitive":
      return (
        <CompetitiveDashboard
          workspaceId={workspaceId}
          projectId={projectId}
          apiBaseUrl={apiBaseUrl}
        />
      );
  }
}

function SpecListStub() {
  return (
    <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-4">
      <p className="text-sm font-medium">Spec browser</p>
      <p className="text-center text-xs">Coming soon</p>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="bg-muted/20 border-border flex h-9 shrink-0 items-center justify-between border-b px-3">
      <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-widest">
        {title}
      </span>
      {action}
    </div>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="hover:bg-primary/10 data-[resize-handle-active]:bg-primary/20 group relative flex w-1 items-center justify-center bg-transparent transition-colors">
      <div className="bg-border/50 group-hover:bg-primary/40 group-data-[resize-handle-active]:bg-primary h-8 w-0.5 rounded-full transition-colors" />
    </PanelResizeHandle>
  );
}
