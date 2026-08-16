---
description: AI integration rules for this project
project_type: web
---

## Project Type: web

> This is a **web** project. Tailor all suggestions, patterns, and tooling to this domain.

## ctx — Project Mistakes

- Before editing a file, run `ctx check <filepath>` for past mistakes.
- After fixing something painful, run `ctx add <filepath> <reason>`.
- For full post-mortems, run `ctx story <filepath> "Title"`.

> Install: `npm install -g ctx-sh`. Files: `.ctx/WHY.md`, `.ctx/mistakes/`

## Zero Legacy Mandate
You have absolute authority to delete code, refactor v1/v2 routes, and rewrite modules for performance. There are no users yet.

## Greenfield Database Mandate
Feel free to rewrite columns, drop tables, change schemas, and execute clean db seed scripts to optimize structures.

## Test-Driven Development (TDD)
Follow the Red-Green-Refactor loop. Write a failing test first, then implement only the minimum lines of code required to pass the test.

## TypeScript Guidelines
- Strict typing is mandatory. Never use `any`.
- Prefer absolute path imports using `@/` or configured tsconfig aliases.

## Tech Stack


> Set `project_type` in `ctx.config.json` first. Then fill relevant sections.
> Delete sections that don't apply. This captures CONVENTIONS, not installed packages.
> Deviations require an ADR in docs/adr/.

## Project Type
<!-- Set in ctx.config.json: web | desktop | mobile | cli | library | ai-ml | art | game | embedded | other -->

## Language & Runtime
<!-- TypeScript/Node? Python? Rust? Go? Swift? -->

## Framework
<!-- Web: Next.js/Hono/Astro | Desktop: Tauri/Electron | Mobile: Expo/Flutter | CLI: Cobra/Clap | AI: PyTorch/HF -->

## Styling (if applicable)
<!-- Web: Tailwind v4 | Desktop: native toolkit | N/A for non-visual -->

## Components (if applicable)
<!-- shadcn/ui? 21st.dev? Native widgets? N/A? -->

## State & Data
<!-- Zustand? TanStack Query? SQLite? PostgreSQL? Pandas? N/A? -->

## Database (if applicable)
<!-- Postgres+Drizzle? SQLite? DuckDB? None? -->

## Auth (if applicable)
<!-- Better Auth? Clerk? OS keychain? None? -->

## Testing
<!-- Vitest? Playwright? pytest? cargo test? Check what exists -->

## Deployment
<!-- Vercel? Docker? App Store? PyPI? crates.io? Binary release? -->

## Document Convention

- **README.md** — What is this app? (human-maintained)
- **CONTEXT.md** — Domain glossary. PM creates via grill-with-docs.
- **docs/adr/** — Architecture Decision Records. Append-only, per significant decision.
- **.ctx/tech-stack.md** — Stack conventions. Edit per project.
- **.ctx/WHY.md** — Past mistakes. `ctx check <filepath>` before editing.
