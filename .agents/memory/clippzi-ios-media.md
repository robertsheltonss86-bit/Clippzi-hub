---
name: Clippzi iOS camera/mic publishing
description: Why LiveKit publishing silently fails on iPhone and the gesture pattern that fixes it
---

# iOS Safari requires a user gesture to publish camera/mic

Calling `createLocalTracks` / `getUserMedia` from a `useEffect` (no tap) makes
iOS Safari reject with `NotAllowedError`. The publisher still *connects* to the
LiveKit room but publishes nothing — so on a multi-party stream (solo, 1v1
battle, or group/cohost) everyone connects yet nobody can see or hear anyone.
`window.location.reload()` in an approval/join flow makes it worse: the page
after a reload has no recent gesture.

**Why:** Browser autoplay/permission policy — media capture must be tied to a
real tap on iOS, even when desktop Chrome allows it without one.

**How to apply:** Auto-attempt publishing once on connect (covers desktop / when
a recent gesture exists), but if it doesn't reach "published/live" within a few
seconds OR throws, surface a big friendly **tap** button ("Tap to go live" /
"Tap to go on camera") whose handler calls the publish function inside the tap.
Only show a real "camera blocked / change settings" error when a *tapped*
attempt fails — an un-tapped failure is expected, not a denial.

**Race guards (required):** use an in-flight `startingRef` so the auto-attempt
and the tap can't both run and double-publish; disconnect any half-open room
before reconnecting; reset publish state (`published`/prompt/error and
`roomRef`) on each new connect cycle and on cleanup so reconnects/stream
switches re-evaluate instead of trusting stale `published=true`. Prefer LiveKit
state as source of truth (check `getTrackPublication(Track.Source.Camera)`)
before publishing again.
