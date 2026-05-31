---
name: DB schema changes
description: How to apply schema changes in this repo (drizzle) without hanging.
---

Define tables in `lib/db/src/schema/*.ts` and export from `schema/index.ts` as usual.

**Rule:** Do NOT run `drizzle-kit push` — it prompts interactively and needs a TTY, so it hangs in this environment. Create/alter the actual tables (and any enums) by running the equivalent SQL through the `executeSql` tool, then verify the tables exist.

**Why:** push's interactive confirmation never resolves headless; the run stalls and wastes a turn.

**How to apply:** any time you add/modify a drizzle table or enum, mirror it with explicit `CREATE TABLE` / `CREATE TYPE` SQL via executeSql.

**Stale .d.ts after schema edits:** `api-server` consumes `@workspace/db` via a TS *project reference* (composite), so its `tsc --noEmit` reads `lib/db/dist/*.d.ts`, NOT the source. After editing schema files you must rebuild those declarations or api-server typecheck fails with "has no exported member" / "Property X does not exist" even though the source is correct. Fix: `pnpm --filter @workspace/db exec tsc --build --force` (clearing `*.tsbuildinfo` alone is not enough). Runtime is unaffected — tsx/bundler resolves the `.` export to `src/index.ts`.

**api-server has no hot reload:** its `dev` script runs `build && start` (esbuild bundle), so route/code changes need a workflow restart to take effect — otherwise new endpoints 404 against the old bundle.
