# UI/UX Redesign + Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four TypeScript errors, add a marketing landing page, replace panel toggle buttons with a permanent icon sidebar, and apply an indigo-accented visual polish across the workspace.

**Architecture:** The web app gains a `/workspace` route that renders `WorkspaceLayout`; the root `/` becomes a marketing page. `WorkspaceLayout` is refactored to include a new `AppSidebar` component (48px icon strip) that controls which component renders in the left panel. Color tokens in `globals.css` are updated to indigo. Backend fixes are isolated casts/import corrections with no logic changes.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, shadcn/ui, react-resizable-panels, lucide-react, TypeScript, Prisma, Express

---

## File Map

### Created

- `apps/web/src/app/workspace/page.tsx` — workspace route, renders `WorkspaceLayout`
- `apps/web/src/components/workspace/AppSidebar.tsx` — 48px icon nav sidebar

### Modified

- `apps/web/src/app/page.tsx` — replaced with marketing landing page
- `apps/web/src/app/globals.css` — indigo primary color tokens
- `apps/web/src/components/workspace/WorkspaceLayout.tsx` — integrate `AppSidebar`, add `activeView` state, remove old left-collapse buttons
- `apps/web/src/components/workspace/TopNav.tsx` — search bar `rounded-lg`, user avatar indigo ring
- `apps/web/src/components/workspace/AgentPanel.tsx` — indigo active tab underline, empty state polish
- `apps/web/src/components/copilot/CopilotInput.tsx:132` — ref cast fix
- `apps/web/src/components/specs/PRDEditor.tsx:651` — ReactNode fix
- `apps/api/src/routes/query.ts:1-10` — swap `EvidenceCompetitor` import to `QueryEvidenceCompetitor`
- `apps/api/src/routes/specs.ts:274` — Prisma InputJsonValue cast

---

## Task 1: Fix CopilotInput ref type error

**Files:**

- Modify: `apps/web/src/components/copilot/CopilotInput.tsx:132`

- [ ] **Step 1: Open the file and locate line 132**

The prop type for `inputRef` is `React.RefObject<HTMLTextAreaElement | null>` (line 21), but React's `<textarea ref={...}>` expects `RefObject<HTMLTextAreaElement>`. The fix is to cast at the call site.

- [ ] **Step 2: Apply the fix**

In `apps/web/src/components/copilot/CopilotInput.tsx`, find line 132 (the `<textarea ref={textareaRef}` line) and change it to:

```tsx
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
```

The surrounding context (keep everything else unchanged):

```tsx
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={handleChange}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep CopilotInput
```

Expected: no output (no errors for that file).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/copilot/CopilotInput.tsx
git commit -m "fix: resolve ref type mismatch in CopilotInput textarea"
```

---

## Task 2: Fix PRDEditor ReactNode error

**Files:**

- Modify: `apps/web/src/components/specs/PRDEditor.tsx:651`

- [ ] **Step 1: Locate the problem**

Around line 651, the expression `(spec.metadata as Record<string, unknown>).evidenceCount ?? 0` returns `unknown | 0`, which TypeScript cannot verify is a valid `ReactNode`. The fix is to wrap it in `String(...)`.

- [ ] **Step 2: Apply the fix**

Find this line in `apps/web/src/components/specs/PRDEditor.tsx`:

```tsx
              {(spec.metadata as Record<string, unknown>).evidenceCount ?? 0} evidence items
```

Replace with:

```tsx
              {String((spec.metadata as Record<string, unknown>).evidenceCount ?? 0)} evidence items
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep PRDEditor
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/specs/PRDEditor.tsx
git commit -m "fix: coerce metadata evidenceCount to string for ReactNode render"
```

---

## Task 3: Fix duplicate EvidenceCompetitor type in query route

**Files:**

- Modify: `apps/api/src/routes/query.ts:1-10`

- [ ] **Step 1: Understand the conflict**

`@pm-yc/ai` exports two types both named `EvidenceCompetitor`:

- From `./prd` (re-exported as `EvidenceCompetitor`): `{ competitorName, featureArea, comparison, quote }`
- From `./query` (re-exported as `QueryEvidenceCompetitor`): `{ name, favorableCount, unfavorableCount, switchingSignals, topFeatureAreas }`

The route in `query.ts` builds objects with the second shape but imports the first name. The fix is to import `QueryEvidenceCompetitor` instead.

- [ ] **Step 2: Update the import block**

In `apps/api/src/routes/query.ts`, replace the import block at lines 1–10:

```ts
import {
  createProvider,
  parseQueryIntent,
  generateQueryResponse,
  type AssembledEvidence,
  type EvidenceInsight,
  type EvidenceOpportunity,
  type EvidenceTheme,
  type QueryEvidenceCompetitor,
} from "@pm-yc/ai";
```

- [ ] **Step 3: Update the variable declaration**

Find the line (around line 141):

```ts
let evidenceCompetitors: EvidenceCompetitor[] = [];
```

Change to:

```ts
let evidenceCompetitors: QueryEvidenceCompetitor[] = [];
```

- [ ] **Step 4: Verify**

```bash
cd apps/api && pnpm exec tsc --noEmit 2>&1 | grep query.ts
```

Expected: no output for `query.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/query.ts
git commit -m "fix: use QueryEvidenceCompetitor type in query route to match constructed shape"
```

---

## Task 4: Fix Prisma InputJsonValue cast in specs route

**Files:**

- Modify: `apps/api/src/routes/specs.ts`

- [ ] **Step 1: Add Prisma import**

In `apps/api/src/routes/specs.ts`, find the existing `@pm-yc/db` import:

```ts
import { db } from "@pm-yc/db";
```

Replace with:

```ts
import { db, Prisma } from "@pm-yc/db";
```

- [ ] **Step 2: Locate the failing cast**

Run:

```bash
cd apps/api && pnpm exec tsc --noEmit 2>&1 | grep specs.ts
```

Note the exact line number of the `Record<string, unknown>` assignment that errors.

- [ ] **Step 3: Apply the cast**

Find the `db.spec.update` call (around line 263–268). The `data: updateData` line casts with `as never`. The actual error is somewhere a JSON field receives `Record<string, unknown>`. Change the cast from `as never` to `as Prisma.InputJsonValue`:

```ts
const updated = await db.spec.update({
  where: { id: specId },
  data: updateData as Prisma.InputJsonValue,
});
```

If the error is on a different line (e.g., inside `specVersion.create`), apply the same cast to that assignment instead.

- [ ] **Step 4: Verify**

```bash
cd apps/api && pnpm exec tsc --noEmit 2>&1 | grep specs.ts
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/specs.ts
git commit -m "fix: cast spec updateData as Prisma.InputJsonValue"
```

---

## Task 5: Update color tokens to indigo

**Files:**

- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Replace primary color tokens**

In `apps/web/src/app/globals.css`, inside `:root { ... }`, find and replace:

```css
--primary: 0 0% 9%;
--primary-foreground: 0 0% 98%;
```

With:

```css
--primary: 239 84% 67%;
--primary-foreground: 0 0% 100%;
```

Inside `.dark { ... }`, find and replace:

```css
--primary: 0 0% 98%;
--primary-foreground: 0 0% 9%;
```

With:

```css
--primary: 234 89% 74%;
--primary-foreground: 0 0% 100%;
```

- [ ] **Step 2: Verify no CSS parse errors**

```bash
cd apps/web && pnpm exec next build 2>&1 | grep -i "error\|css" | head -10
```

Expected: no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat: switch primary color token to indigo"
```

---

## Task 6: Create the AppSidebar component

**Files:**

- Create: `apps/web/src/components/workspace/AppSidebar.tsx`

- [ ] **Step 1: Create the file**

Create `apps/web/src/components/workspace/AppSidebar.tsx` with this content:

```tsx
"use client";

import {
  Layers,
  FileText,
  Lightbulb,
  Target,
  TrendingUp,
  BarChart2,
  Settings,
  User,
} from "lucide-react";

export type ViewKey =
  | "evidence"
  | "specs"
  | "insights"
  | "opportunities"
  | "trends"
  | "competitive";

interface NavItem {
  key: ViewKey;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "evidence", icon: Layers, label: "Evidence" },
  { key: "specs", icon: FileText, label: "Specs" },
  { key: "insights", icon: Lightbulb, label: "Insights" },
  { key: "opportunities", icon: Target, label: "Opportunities" },
  { key: "trends", icon: TrendingUp, label: "Trends" },
  { key: "competitive", icon: BarChart2, label: "Competitive" },
];

interface AppSidebarProps {
  activeView: ViewKey;
  onViewChange: (view: ViewKey) => void;
}

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <aside className="bg-background border-border flex w-12 shrink-0 flex-col border-r">
      {/* Logo mark */}
      <div className="border-border flex h-11 shrink-0 items-center justify-center border-b">
        <span className="text-primary text-xs font-bold tracking-tight">PM</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-1 py-2">
        {NAV_ITEMS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            title={label}
            onClick={() => onViewChange(key)}
            className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
              activeView === key
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </nav>

      {/* Bottom items */}
      <div className="flex flex-col items-center gap-1 py-2">
        <button
          title="Settings"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
        >
          <Settings className="h-4 w-4" />
        </button>
        <button
          title="Account"
          className="bg-primary/10 hover:bg-primary/20 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
        >
          <User className="text-primary h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep AppSidebar
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/AppSidebar.tsx
git commit -m "feat: add AppSidebar component with icon navigation"
```

---

## Task 7: Refactor WorkspaceLayout to use AppSidebar

**Files:**

- Modify: `apps/web/src/components/workspace/WorkspaceLayout.tsx`

- [ ] **Step 1: Read the current file**

Open `apps/web/src/components/workspace/WorkspaceLayout.tsx`. Note the existing imports and state.

- [ ] **Step 2: Replace the entire file**

Replace `apps/web/src/components/workspace/WorkspaceLayout.tsx` with:

```tsx
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
      if (mod && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
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
```

- [ ] **Step 3: Check component prop shapes**

The components `InsightList`, `PrioritizationTable`, `TrendChart`, `CompetitiveDashboard` may not accept `workspaceId`/`projectId`/`apiBaseUrl` props — they fetch their own data or have different interfaces. Run:

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep -E "WorkspaceLayout|LeftPanelContent"
```

If prop errors appear, adjust the `LeftPanelContent` cases to match each component's actual props (remove props not accepted, check the component file's interface). For components that don't need props, render them without:

```tsx
case "insights":
  return <InsightList />;
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workspace/WorkspaceLayout.tsx
git commit -m "feat: replace panel toggles with AppSidebar icon navigation"
```

---

## Task 8: Polish TopNav

**Files:**

- Modify: `apps/web/src/components/workspace/TopNav.tsx`

- [ ] **Step 1: Update search bar and user avatar**

In `apps/web/src/components/workspace/TopNav.tsx`, find the search button class:

```tsx
className =
  "border-border bg-muted/50 text-muted-foreground hover:bg-muted flex h-7 items-center gap-2 rounded-md border px-3 text-xs";
```

Replace `rounded-md` with `rounded-lg` and `border` with `border border-border/80`:

```tsx
className =
  "border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted flex h-7 items-center gap-2 rounded-lg border px-3 text-xs";
```

Find the user avatar button:

```tsx
className =
  "bg-primary/10 hover:bg-primary/20 flex h-7 w-7 items-center justify-center rounded-full";
```

Replace with:

```tsx
className =
  "bg-primary/10 hover:bg-primary/20 ring-primary/30 flex h-7 w-7 items-center justify-center rounded-full ring-2";
```

- [ ] **Step 2: Verify**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep TopNav
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/workspace/TopNav.tsx
git commit -m "feat: polish TopNav search bar and avatar"
```

---

## Task 9: Polish AgentPanel tab bar and empty state

**Files:**

- Modify: `apps/web/src/components/workspace/AgentPanel.tsx`

- [ ] **Step 1: Update active tab style**

In `apps/web/src/components/workspace/AgentPanel.tsx`, find the tab button className expression:

```tsx
activeTab === tab.id
  ? "border-primary text-foreground border-b-2 font-medium"
  : "text-muted-foreground hover:text-foreground";
```

Verify it already uses `border-primary`. If it uses `border-b-2` on a different color, update to `border-primary`. This should already match — confirm by searching for `border-b-2` in the file.

- [ ] **Step 2: Update empty state in AIOutputView**

Find the empty state in `AIOutputView` (the `if (!output)` branch):

```tsx
return (
  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
    <Zap className="h-8 w-8 opacity-30" />
    <p className="text-xs">AI output will appear here</p>
    <p className="text-[10px]">Use slash commands or select text in the editor</p>
  </div>
);
```

Replace with:

```tsx
return (
  <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
    <Zap className="text-primary/40 h-8 w-8" />
    <p className="text-xs font-medium">No output yet</p>
    <p className="text-[11px] leading-relaxed">
      Run a slash command or select text in the editor to see AI output here.
    </p>
  </div>
);
```

- [ ] **Step 3: Verify**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep AgentPanel
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/workspace/AgentPanel.tsx
git commit -m "feat: polish AgentPanel empty state with indigo icon"
```

---

## Task 10: Create the workspace route

**Files:**

- Create: `apps/web/src/app/workspace/page.tsx`

- [ ] **Step 1: Create the directory and file**

Create `apps/web/src/app/workspace/page.tsx`:

```tsx
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";

export default function WorkspacePage() {
  return (
    <WorkspaceLayout
      workspaceId="demo"
      projectId="demo"
      apiBaseUrl={process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep workspace
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/workspace/page.tsx
git commit -m "feat: add /workspace route rendering WorkspaceLayout"
```

---

## Task 11: Replace the landing page

**Files:**

- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace the entire file**

Replace `apps/web/src/app/page.tsx` with:

```tsx
import Link from "next/link";
import { Layers, Bot, FileText, ArrowRight } from "lucide-react";

const FEATURES = [
  {
    icon: Layers,
    title: "Evidence Explorer",
    description:
      "Browse themes, insights, and raw feedback from customers. Every claim is traceable to a source.",
  },
  {
    icon: Bot,
    title: "AI Copilot",
    description:
      "Ask questions, challenge assumptions, and expand specs with cited answers backed by real evidence.",
  },
  {
    icon: FileText,
    title: "Spec Editor",
    description:
      "Write PRDs with slash commands and AI suggestions. Every section linked to supporting evidence.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#0a0a0a] text-white">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <p className="text-primary mb-4 text-[11px] font-semibold uppercase tracking-[0.2em]">
          Product Intelligence Platform
        </p>
        <h1 className="mb-6 max-w-2xl text-5xl font-bold leading-tight tracking-tight text-white">
          Turn user feedback into product decisions
        </h1>
        <p className="mb-10 max-w-xl text-xl leading-relaxed text-[#a1a1aa]">
          PM-YC synthesizes customer evidence, surfaces insights, and helps you write specs backed
          by real data.
        </p>
        <Link
          href="/workspace"
          className="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
        >
          Open Workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      {/* Feature highlights */}
      <section className="border-t border-white/10 px-6 py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col gap-3">
              <div className="bg-primary/15 flex h-10 w-10 items-center justify-center rounded-lg">
                <Icon className="text-primary h-5 w-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-[#a1a1aa]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 px-8 py-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="text-sm font-bold text-white">PM-YC</span>
          <span className="text-xs text-[#71717a]">Product Intelligence Platform</span>
        </div>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | grep "page.tsx"
```

Expected: no output for the root page.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat: replace placeholder with marketing landing page"
```

---

## Task 12: Full TypeScript verification

- [ ] **Step 1: Run full type check on web**

```bash
cd /path/to/PM-YC && pnpm --filter web exec tsc --noEmit 2>&1
```

Expected: no errors. If errors remain, fix them before proceeding.

- [ ] **Step 2: Run full type check on api**

```bash
pnpm --filter api exec tsc --noEmit 2>&1
```

Expected: no errors (or only pre-existing errors unrelated to this work).

- [ ] **Step 3: Start the dev server and verify visually**

```bash
pnpm --filter web dev
```

Open `http://localhost:3000` — should show the dark landing page with indigo CTA.
Open `http://localhost:3000/workspace` — should show the full workspace with the AppSidebar on the left.
Click each sidebar icon — left panel should swap content.
Toggle the right panel collapse button — should collapse/expand the Agent panel.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete UI/UX redesign — landing page, sidebar nav, indigo theme, bug fixes"
```
