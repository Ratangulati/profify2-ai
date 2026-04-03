# SaaS Product Intelligence Platform — Monorepo Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a production-ready Turborepo monorepo with 4 apps, 4 packages, Docker Compose, CI, and shared tooling.

**Architecture:** Turborepo monorepo with pnpm workspaces. Apps consume internal packages via TypeScript path aliases. Shared ESLint/Prettier/TSConfig at root. Docker Compose provides Postgres, Redis, MinIO for local dev.

**Tech Stack:** TypeScript, Next.js 14 (App Router), Express, Prisma, PostgreSQL, Redis, BullMQ, Zod, shadcn/ui, Tailwind CSS, @t3-oss/env-nextjs, MCP SDK, OpenAI/Anthropic SDKs.

---

## File Structure

```
PM-YC/
├── turbo.json
├── package.json                    # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.json                   # Base TS config
├── .prettierrc
├── .prettierignore
├── .eslintrc.js
├── .gitignore
├── .env.example
├── .husky/
│   └── pre-commit
├── docker-compose.yml
├── .github/
│   └── workflows/
│       └── ci.yml
├── apps/
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   ├── postcss.config.js
│   │   ├── components.json          # shadcn/ui config
│   │   └── src/
│   │       ├── app/
│   │       │   ├── layout.tsx
│   │       │   ├── page.tsx
│   │       │   └── globals.css
│   │       ├── components/
│   │       │   └── ui/              # shadcn/ui components
│   │       ├── lib/
│   │       │   └── utils.ts
│   │       └── env.ts               # @t3-oss/env-nextjs
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── env.ts
│   │       ├── routes/
│   │       │   ├── index.ts
│   │       │   └── health.ts
│   │       └── middleware/
│   │           └── error-handler.ts
│   ├── mcp-server/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── server.ts
│   │       └── tools/
│   │           └── index.ts
│   └── worker/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── env.ts
│           ├── queues/
│           │   └── index.ts
│           └── processors/
│               └── example.ts
├── packages/
│   ├── db/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── prisma/
│   │       └── schema.prisma
│   │   └── src/
│   │       └── index.ts
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types/
│   │       │   └── index.ts
│   │       ├── validators/
│   │       │   └── index.ts
│   │       └── utils/
│   │           └── index.ts
│   ├── ai/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── providers/
│   │       │   ├── openai.ts
│   │       │   ├── anthropic.ts
│   │       │   └── local.ts
│   │       └── types.ts
│   └── ui/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           └── button.tsx
└── tooling/
    ├── eslint/
    │   ├── package.json
    │   └── base.js
    ├── prettier/
    │   ├── package.json
    │   └── index.js
    └── tsconfig/
        ├── package.json
        ├── base.json
        ├── nextjs.json
        └── node.json
```

---

## Task 1: Root Monorepo Configuration

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `.prettierrc`, `.prettierignore`

- [ ] Step 1: Initialize git and create root package.json with pnpm workspaces
- [ ] Step 2: Create pnpm-workspace.yaml
- [ ] Step 3: Create turbo.json with pipeline config
- [ ] Step 4: Create root tsconfig.json (base config)
- [ ] Step 5: Create .gitignore, .env.example, .prettierrc, .prettierignore
- [ ] Step 6: Commit

## Task 2: Shared Tooling Packages (ESLint, Prettier, TSConfig)

**Files:**

- Create: `tooling/eslint/package.json`, `tooling/eslint/base.js`, `tooling/prettier/package.json`, `tooling/prettier/index.js`, `tooling/tsconfig/package.json`, `tooling/tsconfig/base.json`, `tooling/tsconfig/nextjs.json`, `tooling/tsconfig/node.json`
- Modify: `package.json` (root — add .eslintrc.js)
- Create: `.eslintrc.js`

- [ ] Step 1: Create tooling/tsconfig configs (base, nextjs, node)
- [ ] Step 2: Create tooling/prettier config
- [ ] Step 3: Create tooling/eslint config
- [ ] Step 4: Create root .eslintrc.js
- [ ] Step 5: Commit

## Task 3: packages/shared

**Files:**

- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/types/index.ts`, `packages/shared/src/validators/index.ts`, `packages/shared/src/utils/index.ts`

- [ ] Step 1: Create package.json with Zod dependency
- [ ] Step 2: Create tsconfig.json extending node base
- [ ] Step 3: Create types, validators, and utils modules
- [ ] Step 4: Create barrel export
- [ ] Step 5: Commit

## Task 4: packages/db

**Files:**

- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`

- [ ] Step 1: Create package.json with Prisma deps
- [ ] Step 2: Create tsconfig.json
- [ ] Step 3: Create Prisma schema with PostgreSQL, example models
- [ ] Step 4: Create client export
- [ ] Step 5: Commit

## Task 5: packages/ai

**Files:**

- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`, `packages/ai/src/types.ts`, `packages/ai/src/providers/openai.ts`, `packages/ai/src/providers/anthropic.ts`, `packages/ai/src/providers/local.ts`

- [ ] Step 1: Create package.json with OpenAI + Anthropic SDK deps
- [ ] Step 2: Create types and provider interface
- [ ] Step 3: Create OpenAI, Anthropic, and local provider implementations
- [ ] Step 4: Create barrel export with factory
- [ ] Step 5: Commit

## Task 6: packages/ui

**Files:**

- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/src/button.tsx`

- [ ] Step 1: Create package.json with React peer deps
- [ ] Step 2: Create tsconfig.json extending base
- [ ] Step 3: Create example Button component and barrel export
- [ ] Step 4: Commit

## Task 7: apps/web (Next.js 14)

**Files:**

- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/tailwind.config.ts`, `apps/web/postcss.config.js`, `apps/web/components.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/lib/utils.ts`, `apps/web/src/env.ts`

- [ ] Step 1: Create package.json with Next.js, Tailwind, shadcn/ui deps
- [ ] Step 2: Create tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.js
- [ ] Step 3: Create shadcn/ui components.json
- [ ] Step 4: Create env.ts with @t3-oss/env-nextjs
- [ ] Step 5: Create app layout, page, globals.css, and lib/utils
- [ ] Step 6: Commit

## Task 8: apps/api (Express)

**Files:**

- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/src/env.ts`, `apps/api/src/routes/index.ts`, `apps/api/src/routes/health.ts`, `apps/api/src/middleware/error-handler.ts`

- [ ] Step 1: Create package.json with Express, cors, helmet deps
- [ ] Step 2: Create tsconfig.json, env.ts
- [ ] Step 3: Create Express server entry, routes, error handler
- [ ] Step 4: Commit

## Task 9: apps/mcp-server

**Files:**

- Create: `apps/mcp-server/package.json`, `apps/mcp-server/tsconfig.json`, `apps/mcp-server/src/index.ts`, `apps/mcp-server/src/server.ts`, `apps/mcp-server/src/tools/index.ts`

- [ ] Step 1: Create package.json with @modelcontextprotocol/sdk
- [ ] Step 2: Create tsconfig.json
- [ ] Step 3: Create MCP server with example tool
- [ ] Step 4: Commit

## Task 10: apps/worker (BullMQ)

**Files:**

- Create: `apps/worker/package.json`, `apps/worker/tsconfig.json`, `apps/worker/src/index.ts`, `apps/worker/src/env.ts`, `apps/worker/src/queues/index.ts`, `apps/worker/src/processors/example.ts`

- [ ] Step 1: Create package.json with BullMQ deps
- [ ] Step 2: Create tsconfig.json, env.ts
- [ ] Step 3: Create queue definitions and example processor
- [ ] Step 4: Create worker entry point
- [ ] Step 5: Commit

## Task 11: Docker Compose

**Files:**

- Create: `docker-compose.yml`

- [ ] Step 1: Create docker-compose.yml with Postgres, Redis, MinIO
- [ ] Step 2: Commit

## Task 12: GitHub Actions CI

**Files:**

- Create: `.github/workflows/ci.yml`

- [ ] Step 1: Create CI pipeline (lint, type-check, test, build)
- [ ] Step 2: Commit

## Task 13: Husky Pre-commit Hooks

**Files:**

- Create: `.husky/pre-commit`
- Modify: `package.json` (add prepare script)

- [ ] Step 1: Configure Husky with lint-staged
- [ ] Step 2: Commit

## Task 14: Install Dependencies & Verify

- [ ] Step 1: Run pnpm install
- [ ] Step 2: Run turbo build to verify everything compiles
- [ ] Step 3: Final commit
