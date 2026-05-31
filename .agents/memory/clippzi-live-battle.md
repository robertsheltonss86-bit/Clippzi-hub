---
name: Clippzi live battle (co-stream) mechanics
description: How the two-host "battle" mode renders video and stores scores — non-obvious unit and identity rules.
---

# Battle mode

- A battle links two SEPARATE livestreams (each host broadcasts to its own LiveKit room `stream-<id>`), connected via `battleOpponentId` + `battleEndsAt` on each row.
- To show both hosts in the split-screen battle UI, render LIVE LiveKit: own side = `LiveKitBroadcaster` (host) or `LiveKitViewer(streamId)`; opponent side = `LiveKitViewer(opponent.id)`. Do NOT use static `thumbnailUrl` images — that was the original "can't see each other" bug.
- `LiveKitViewer` only attaches tracks from participants whose identity starts with `host-`. Correct for 1v1 battles (you want the opponent's host feed). If you ever need cohost feeds in a viewer, widen this filter.

## Money / points units (IMPORTANT)
- 1 point = 1 cent. Money columns are stored in DOLLARS as `numeric(10,2)`: `totalGiftsReceived`, `battleScore`, `battleOpponentScore`.
- **Why:** the UI must show whole "points", never dollars/pennies. The single conversion helper is `artifacts/clippzi/src/lib/points.ts` `formatPoints(dollars) = round(dollars*100)`.
- **How to apply:** every writer to `battleScore`/`battleOpponentScore` must use DOLLARS. Gift confirm adds the gift's dollar `total`. The `/battle/score` endpoint takes integer `points` and must divide by 100 before incrementing. Mixing raw points into these dollar fields inflates scores 100x.
- Gifts are real Stripe payments; the points label is purely presentational (Stripe checkout still shows USD).
