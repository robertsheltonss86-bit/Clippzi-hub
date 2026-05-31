---
name: Clippzi live battle (co-stream) mechanics
description: How the two-host "battle" mode renders video and stores scores — non-obvious unit and identity rules.
---

# Battle mode

- A battle links two SEPARATE livestreams (each host broadcasts to its own LiveKit room `stream-<id>`), connected via `battleOpponentId` + `battleEndsAt` on each row.
- To show both hosts in the split-screen battle UI, render LIVE LiveKit: own side = `LiveKitBroadcaster` (host) or `LiveKitViewer(streamId)`; opponent side = `LiveKitViewer(opponent.id)`. Do NOT use static `thumbnailUrl` images — that was the original "can't see each other" bug.
- `LiveKitViewer` only attaches tracks from participants whose identity starts with `host-`. Correct for 1v1 battles (you want the opponent's host feed). If you ever need cohost feeds in a viewer, widen this filter.

## Why both creators couldn't see each other (and the fix shape)
- The host's broadcaster must keep a STABLE position in the React tree across the solo↔battle toggle. If it lives in two different conditional branches, toggling a battle unmounts/remounts it, re-acquiring the iPhone camera mid-battle (black frame for the opponent). Render solo+battle in one shared wrapper whose className flips between full-screen and 2-col grid; keep the own feed at the same position/key.
- The opponent tile should connect straight to the opponent's room id (the battle-opponent stream id), not via a cached "all live streams" list — the list can be stale/missing the opponent and is capped, so the video silently fails to bind. Use the cached list only for cosmetic name/avatar.
- The cross-room viewer should NOT use adaptiveStream for always-on-screen tiles (it can pause/never-subscribe a small tile). Only flip the viewer to "live" when a video track actually attaches, and only show "waiting" on host-disconnect if no host participant remains (avoids reconnect flicker).

## Moderation endpoint auth (admin model)
- Admin gating uses `req.user.isAdmin` via the `requireAdmin` middleware (alongside `requireAuth`/`requireSelf`) in the api-server auth middleware. The client mirrors this with `isAdmin` from `useCurrentUser` (the /moderation nav + page are admin-only).
- The moderation report list and the destructive resolve/PATCH (which rejects posts / deletes comments + live-chat rows) must be `requireAdmin`. Report creation and the analyze endpoint are `requireAuth` (any logged-in user), and report creation must take the reporter id from the authenticated user, never the request body.
- The admin moderation queue is sorted highest-severity-first (AI score desc, then recency).

## Battle endpoint auth
- The direct battle endpoints (POST /battle start, DELETE /battle end, POST /battle/score) are host-only (requireAuth + stream.userId === appUserId). The client UI drives battles through the request/accept flow and ends via DELETE /battle; /battle/score is effectively unused by the client because gifts score server-side in checkout.ts.

## Money / points units (IMPORTANT)
- 1 point = 1 cent. Money columns are stored in DOLLARS as `numeric(10,2)`: `totalGiftsReceived`, `battleScore`, `battleOpponentScore`.
- **Why:** the UI must show whole "points", never dollars/pennies. The single conversion helper is `artifacts/clippzi/src/lib/points.ts` `formatPoints(dollars) = round(dollars*100)`.
- **How to apply:** every writer to `battleScore`/`battleOpponentScore` must use DOLLARS. Gift confirm adds the gift's dollar `total`. The `/battle/score` endpoint takes integer `points` and must divide by 100 before incrementing. Mixing raw points into these dollar fields inflates scores 100x.
- Gifts are real Stripe payments; the points label is purely presentational (Stripe checkout still shows USD).

## Live-stream right action rail (mobile overflow)
- The TikTok-style right rail on the live-stream page is absolutely positioned and grows UPWARD from a bottom anchor. A host sees more buttons than a viewer (Share, Who's Live, Cohost, Battle/End, Filter), so a bottom-only anchor pushed the TOP buttons (Share, Who's Live) off-screen behind the header/notch — they looked "missing".
- Fix: bound the rail with BOTH a top (safe-area + header offset) and bottom (above the 38% chat overlay), keep the most-used buttons first/top, and make it overflow-y-auto with non-shrinking children. Adding more rail buttons later must respect this bounded+scroll container, not a fixed bottom anchor.
