---
name: Clippzi auth gating
description: How hand-written express routes must be guarded, and the role-escalation pitfall in user updates.
---

# Auth gating on hand-written express routes

Hand-written routes (the COINS/payout/support pattern, NOT orval) do not get auth automatically. Every privileged route must explicitly attach a guard from `middlewares/authMiddleware.ts`:
- `requireAuth` — any logged-in user.
- `requireSelf("id")` — only the account owner (compares `req.user.appUserId` to the `:id` param).
- `requireAdmin` — only `req.user.isAdmin`.

**Why:** `PATCH /users/:id` was originally added with NO guard and applied a client-supplied `role`, so any anonymous request could set itself to `admin`. That silently defeats every other `requireAdmin` check in the app (payout-handle reads, problem-report admin views). A missing guard on one write route can break authorization everywhere.

**How to apply:**
- Profile self-edits: guard with `requireSelf("id")`.
- Never trust privileged fields (`role`, `isAdmin`, verification flags) from the request body on a self-edit route — only apply `role` when `req.user?.isAdmin` is true.
- When adding any new admin-gated read, confirm there is no separate unguarded write path that can flip the flag the guard relies on.
