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

# Mid-stream auto-rejoin must distinguish intentional vs unexpected disconnect

A `RoomEvent.Disconnected` handler that blindly rejoins causes reconnect storms
and rejoins rooms the user deliberately left. Gate every rejoin with: (1) an
intent ref set on user-stop/unmount (`manualStopRef` for publisher,
`leftRef` for viewer) — skip rejoin when true; (2) a `roomRef.current === room`
identity check so a handler from a superseded connect attempt can't fire.
Reset the intent ref to false at the *start* of each connect cycle.

**Why:** mid-battle network blips were dropping both sides while the DB still
showed "in battle"; LiveKit's internal retries give up and emit `Disconnected`,
so we need an app-level rejoin — but only for *unexpected* drops.

# Battle/cohost split-screen video: use object-contain, not object-cover

Tiles in a narrow `grid-cols-2` battle column with `object-cover` crop faces
badly ("zoomed in"). Add a `fit` prop to broadcaster/viewer and pass
`fit="contain"` during battles; keep `cover` for full-screen solo.

# Hiding the default Radix Sheet close (iOS notch)

The shadcn `SheetContent` renders a built-in close `<button class="absolute
right-4 top-4 ...">` that is tiny and sits under the iPhone status bar on a
full-height right Sheet. Hide ONLY it with `[&>button.right-4]:hidden` (do not
use `[&>button]:hidden` — it also hides your custom `SheetClose`), then render a
larger custom `SheetClose` offset by `env(safe-area-inset-top)`.
