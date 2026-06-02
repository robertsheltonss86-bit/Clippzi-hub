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

# Do NOT add an app-level RoomEvent.Disconnected -> rejoin loop

Rely on LiveKit's built-in reconnection for transient drops. An app-level
`RoomEvent.Disconnected` handler that calls `start()`/`join()` again caused a
production reconnect storm in battle: a single drop rejoined with the SAME
stable host identity (`host-{id}-{me}` minted server-side), which kicked the
prior same-identity connection, firing `Disconnected` again — an endless
ping-pong. Symptom was "I can only see myself, can't see/connect to others" in
BOTH battle and cohost, because the broadcaster/local tile attaches the local
camera straight to its own `<video>` so self-preview shows even when
publish/subscribe never stabilizes. Server logs showed bursts of repeated
`POST /livekit-token` for the same stream.

**Why:** the stable, role-encoded host/cohost identity makes any overlapping
same-identity connect self-kick; a manual rejoin amplifies one drop into a
storm. If "battle kicked both out, DB still in battle" recurs, fix it via
server-side battle/heartbeat cleanup or a (rand)-suffixed publisher identity —
NOT a client Disconnected->rejoin handler.

# Group/cohost: local tile needs localTrack* events to show your own camera

In the multi-tile group room, a per-participant tile that attaches video on
mount + remote events (`trackSubscribed`/`trackPublished`) will show remote
people but NOT yourself. The local participant publishes its camera *after*
mount (esp. after the iOS tap-to-go-on-camera), and the LOCAL participant emits
`localTrackPublished`/`localTrackUnpublished`, NOT the remote `track*` events.
Listen for those (plus `trackMuted`/`trackUnmuted`) on the tile and re-run the
attach, or your own tile stays on the avatar placeholder forever.

**Why:** reported as "in cohost I can see others but not myself"; remote tiles
worked, proving attach logic was fine — only the local re-attach trigger was
missing.

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

# Live video quality: simulcast + iOS 720p / others 1080p

Live publish uses LiveKit simulcast (multiple resolutions at once) so the SFU
gives each viewer the best layer their bandwidth allows. Capture resolution is
an *ideal* hint, so cameras downscale gracefully (no OverconstrainedError).
Solo/battle host: 1080p on desktop/Android, 720p on iOS. Group/cohost: 720p per
tile (was 360p) — lower because many tiles share bandwidth. Audio: red+dtx.

**Why:** iOS Safari (the owner's primary device) can be unstable encoding 1080p
with multiple simulcast layers and may fail to publish at all; 720p is reliable
and still HD/TikTok-comparable. Detect iOS via UA + (MacIntel && maxTouchPoints>1
for iPadOS). **How to apply:** keep the top simulcast layer modest on iOS; never
force a single high resolution with no graceful path on the host.
