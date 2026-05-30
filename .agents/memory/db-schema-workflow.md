---
name: DB schema changes
description: How to apply schema changes in this repo (drizzle) without hanging.
---

Define tables in `lib/db/src/schema/*.ts` and export from `schema/index.ts` as usual.

**Rule:** Do NOT run `drizzle-kit push` — it prompts interactively and needs a TTY, so it hangs in this environment. Create/alter the actual tables (and any enums) by running the equivalent SQL through the `executeSql` tool, then verify the tables exist.

**Why:** push's interactive confirmation never resolves headless; the run stalls and wastes a turn.

**How to apply:** any time you add/modify a drizzle table or enum, mirror it with explicit `CREATE TABLE` / `CREATE TYPE` SQL via executeSql.
