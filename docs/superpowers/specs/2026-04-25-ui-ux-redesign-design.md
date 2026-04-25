# UI/UX Redesign + Bug Fixes — Design Spec

**Date:** 2026-04-25

## Overview

Full-pass redesign of PM-YC's frontend covering four areas: TypeScript bug fixes, route restructuring, landing page, workspace sidebar navigation, and visual polish. The goal is to ship a working, credible product that a PM can open and immediately understand.

Visual direction: Linear/Vercel-inspired — sharp, dark-by-default, indigo brand accent, no decorative gradients.

---

## Section 1: Bug Fixes

### 1.1 `apps/web/src/components/copilot/CopilotInput.tsx:132`

**Error:** `RefObject<HTMLTextAreaElement | null>` is not assignable to `LegacyRef<HTMLTextAreaElement>`.
**Fix:** Cast the ref at the call site: `ref={textareaRef as React.RefObject<HTMLTextAreaElement>}`.

### 1.2 `apps/web/src/components/specs/PRDEditor.tsx:651`

**Error:** `{}` not assignable to `ReactNode`.
**Fix:** Coerce the metadata expression to a primitive: `String((spec.metadata as Record<string, unknown>).evidenceCount ?? 0)`.

### 1.3 `apps/api/src/routes/query.ts:160+185`

**Error:** Duplicate `EvidenceCompetitor` type — `packages/ai/src/prd/types` and `packages/ai/src/query/evidence` export the same name with incompatible shapes.
**Fix:** The route builds objects with shape `{ name, favorableCount, unfavorableCount, switchingSignals, topFeatureAreas }`. Import `EvidenceCompetitor` only from `packages/ai/src/query/evidence` (which matches that shape) and remove the conflicting import from `packages/ai/src/prd/types`.

### 1.4 `apps/api/src/routes/specs.ts:274`

**Error:** `Record<string, unknown>` not assignable to Prisma's `InputJsonValue`.
**Fix:** Cast as `Prisma.InputJsonValue`.

---

## Section 2: Route Structure

| Route        | Component         | Notes                           |
| ------------ | ----------------- | ------------------------------- |
| `/`          | New `LandingPage` | Marketing/onboarding page       |
| `/workspace` | `WorkspaceLayout` | Full app; hardcoded IDs for now |

- `apps/web/src/app/page.tsx` becomes the landing page.
- New `apps/web/src/app/workspace/page.tsx` renders `WorkspaceLayout`.
- `WorkspaceLayout` receives `workspaceId="demo"` and `projectId="demo"` as defaults until auth is wired.

---

## Section 3: Landing Page

**File:** `apps/web/src/app/page.tsx`

Three sections rendered on a dark (`#0a0a0a`) full-screen page:

### Hero (centered, vertically middle of viewport)

- Headline: "Turn user feedback into product decisions" — `text-5xl font-bold`
- Subheadline: "PM-YC synthesizes customer evidence, surfaces insights, and helps you write specs backed by real data." — `text-xl text-muted-foreground`
- CTA button: "Open Workspace →" — indigo filled, routes to `/workspace`
- Optional: small "Product Intelligence Platform" label above the headline in indigo uppercase

### Feature Highlights (3-column grid, below hero)

| Icon       | Title             | Description                                                                |
| ---------- | ----------------- | -------------------------------------------------------------------------- |
| `Layers`   | Evidence Explorer | Browse themes, insights, and raw feedback from customers                   |
| `Bot`      | AI Copilot        | Ask questions, challenge assumptions, and expand specs with cited answers  |
| `FileText` | Spec Editor       | Write PRDs backed by real evidence, with slash commands and AI suggestions |

### Footer

- Left: "PM-YC" wordmark
- Right: "Product Intelligence Platform" tagline
- `border-t border-border` separator, `py-6 px-8`

---

## Section 4: Workspace Sidebar Navigation

**Replaces:** The existing left-panel toggle button approach.
**New component:** `apps/web/src/components/workspace/AppSidebar.tsx`

### Layout

- 48px-wide permanent icon sidebar, sits to the left of the `PanelGroup`
- `bg-background border-r border-border flex flex-col`
- Always visible; does not collapse

### Navigation items (top section)

| Icon         | View key        | Label (tooltip) |
| ------------ | --------------- | --------------- |
| `Layers`     | `evidence`      | Evidence        |
| `FileText`   | `specs`         | Specs           |
| `Lightbulb`  | `insights`      | Insights        |
| `Target`     | `opportunities` | Opportunities   |
| `TrendingUp` | `trends`        | Trends          |
| `BarChart2`  | `competitive`   | Competitive     |

### Bottom items

| Icon       | Action                      |
| ---------- | --------------------------- |
| `Settings` | Settings (no-op for now)    |
| `User`     | User avatar (no-op for now) |

### Active state

- Active item: indigo pill background `bg-primary/15`, icon in `text-primary`
- Inactive: `text-muted-foreground hover:text-foreground hover:bg-accent`
- Each item is a `<button>` with a `title` tooltip

### Left panel content

`WorkspaceLayout` tracks `activeView: ViewKey` state. The left panel renders:

- `evidence` → `<EvidenceExplorer />`
- `specs` → `<SpecListView />` (new stub, shows "Spec browser coming soon")
- `insights` → `<InsightList />`
- `opportunities` → `<PrioritizationTable />`
- `trends` → `<TrendChart />`
- `competitive` → `<CompetitiveDashboard />`

Default active view: `evidence`.

### WorkspaceLayout changes

- Remove the collapse/expand toggle buttons from panel headers
- Remove `leftCollapsed` / `rightCollapsed` state (sidebar replaces left panel toggle)
- Left panel remains resizable but no longer collapsible via button
- Right panel (Agent) keeps its collapse button
- `AppSidebar` sits as a sibling to `PanelGroup` in the flex row

---

## Section 5: Visual Redesign

### 5.1 Color system (`apps/web/src/app/globals.css`)

Replace the neutral primary with indigo:

```css
:root {
  --primary: 239 84% 67%; /* indigo-500 #6366f1 */
  --primary-foreground: 0 0% 100%;
}
.dark {
  --primary: 234 89% 74%; /* indigo-400 #818cf8 */
  --primary-foreground: 0 0% 100%;
}
```

All other tokens (background, foreground, muted, border) stay neutral — indigo appears only on active states, CTAs, and focus rings.

### 5.2 Panel headers

- Add `bg-muted/20` background tint to panel header bars
- Section label: `text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`

### 5.3 Tab bars (AgentPanel)

- Active tab: `border-b-2 border-primary text-foreground` (indigo underline)
- Inactive: `text-muted-foreground hover:text-foreground`

### 5.4 TopNav

- Search bar: `rounded-lg` (was `rounded-md`), border slightly more prominent
- User avatar: add `ring-2 ring-primary/30` indigo ring

### 5.5 Empty states

- Agent Output empty state: replace generic `Zap` icon with indigo-tinted version `text-primary/40`
- Message: "Run a slash command or select text in the editor to see AI output here."

### 5.6 Resize handles

- Default state: `bg-border/50` (slightly visible, not invisible)

---

## Out of Scope

- Auth wiring (login flow, session management)
- Real data fetching for stub views (Spec browser, etc.)
- Mobile / responsive layout
- Animations or transitions
