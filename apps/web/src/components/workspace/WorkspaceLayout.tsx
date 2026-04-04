"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { TopNav } from "./TopNav";
import { CommandPalette } from "./CommandPalette";
import { EvidenceExplorer } from "./EvidenceExplorer";
import { SpecEditorPanel } from "../editor/SpecEditorPanel";
import { AgentPanel } from "./AgentPanel";

interface WorkspaceLayoutProps {
  workspaceId: string;
  projectId: string;
  apiBaseUrl: string;
}

export function WorkspaceLayout({ workspaceId, projectId, apiBaseUrl }: WorkspaceLayoutProps) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const leftPanelRef = useRef<{ expand: () => void; collapse: () => void } | null>(null);
  const centerPanelRef = useRef<{ expand: () => void } | null>(null);
  const rightPanelRef = useRef<{ expand: () => void; collapse: () => void } | null>(null);

  // AI output state shared between center and right panels
  const [aiOutput, setAIOutput] = useState<{ command: string; content: string } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+1/2/3 to focus panels
      if (mod && e.key === "1") {
        e.preventDefault();
        if (leftCollapsed) {
          leftPanelRef.current?.expand();
          setLeftCollapsed(false);
        }
      }
      if (mod && e.key === "2") {
        e.preventDefault();
        // Center panel is always visible
      }
      if (mod && e.key === "3") {
        e.preventDefault();
        if (rightCollapsed) {
          rightPanelRef.current?.expand();
          setRightCollapsed(false);
        }
      }

      // Cmd+B to toggle left sidebar
      if (mod && e.key === "b") {
        e.preventDefault();
        if (leftCollapsed) {
          leftPanelRef.current?.expand();
          setLeftCollapsed(false);
        } else {
          leftPanelRef.current?.collapse();
          setLeftCollapsed(true);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [leftCollapsed, rightCollapsed]);

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

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel — Evidence Explorer */}
        <Panel
          ref={leftPanelRef as never}
          defaultSize={25}
          minSize={15}
          collapsible
          collapsedSize={0}
          onCollapse={() => setLeftCollapsed(true)}
          onExpand={() => setLeftCollapsed(false)}
          className={leftCollapsed ? "hidden" : ""}
        >
          <div className="border-border flex h-full flex-col border-r">
            <PanelHeader
              title="Evidence"
              collapsed={leftCollapsed}
              onToggle={() => {
                if (leftCollapsed) {
                  leftPanelRef.current?.expand();
                } else {
                  leftPanelRef.current?.collapse();
                }
              }}
              toggleIcon={
                leftCollapsed ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )
              }
              shortcut={"\u23181"}
            />
            <div className="flex-1 overflow-hidden">
              <EvidenceExplorer
                workspaceId={workspaceId}
                projectId={projectId}
                apiBaseUrl={apiBaseUrl}
              />
            </div>
          </div>
        </Panel>

        {/* Left resize handle */}
        {!leftCollapsed && <ResizeHandle />}

        {/* Left collapsed indicator */}
        {leftCollapsed && (
          <button
            onClick={() => {
              leftPanelRef.current?.expand();
              setLeftCollapsed(false);
            }}
            className="border-border bg-muted/30 hover:bg-muted flex w-8 shrink-0 items-center justify-center border-r"
            title="Expand Evidence panel (Cmd+1)"
          >
            <PanelLeftOpen className="text-muted-foreground h-3.5 w-3.5" />
          </button>
        )}

        {/* Center Panel — Spec Editor */}
        <Panel ref={centerPanelRef as never} defaultSize={50} minSize={30}>
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
            title="Expand Agent panel (Cmd+3)"
          >
            <PanelRightOpen className="text-muted-foreground h-3.5 w-3.5" />
          </button>
        )}

        {/* Right resize handle */}
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
              collapsed={rightCollapsed}
              onToggle={() => {
                if (rightCollapsed) {
                  rightPanelRef.current?.expand();
                } else {
                  rightPanelRef.current?.collapse();
                }
              }}
              toggleIcon={
                rightCollapsed ? (
                  <PanelRightOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelRightClose className="h-3.5 w-3.5" />
                )
              }
              shortcut={"\u23183"}
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

// ── Shared sub-components ────────────────────────────────────────────

function PanelHeader({
  title,
  collapsed,
  onToggle,
  toggleIcon,
  shortcut,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  toggleIcon: React.ReactNode;
  shortcut: string;
}) {
  return (
    <div className="border-border flex h-9 shrink-0 items-center justify-between border-b px-3">
      <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
        {title}
      </span>
      <button
        onClick={onToggle}
        className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-6 w-6 items-center justify-center rounded"
        title={`Toggle ${title} (${shortcut})`}
      >
        {toggleIcon}
      </button>
    </div>
  );
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="hover:bg-primary/10 data-[resize-handle-active]:bg-primary/20 group relative flex w-1 items-center justify-center bg-transparent transition-colors">
      <div className="bg-border group-hover:bg-primary/40 group-data-[resize-handle-active]:bg-primary h-8 w-0.5 rounded-full transition-colors" />
    </PanelResizeHandle>
  );
}
