import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteTrack,
  RemoteParticipant,
  LocalParticipant,
  createLocalTracks,
  type LocalTrackPublication,
} from "livekit-client";
import { Camera, CameraOff, Mic, MicOff, AlertCircle, Loader2, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

type Status = "idle" | "connecting" | "live" | "denied" | "no-device" | "insecure" | "error" | "waiting";

async function fetchToken(streamId: number, role: "publisher" | "viewer"): Promise<{ token: string; url: string }> {
  const base = import.meta.env.BASE_URL;
  const r = await fetch(`${base}api/livestreams/${streamId}/livekit-token`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

/**
 * Host's view: publishes camera + mic to the room. Shows local preview (mirrored).
 */
export function LiveKitBroadcaster({ streamId, filterCss, fit = "cover" }: { streamId: number; filterCss?: string; fit?: "cover" | "contain" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const startingRef = useRef(false); // serialize auto-attempt + tap/retry so we never double-connect
  const manualStopRef = useRef(false); // true only when the user intentionally ends — suppresses auto-rejoin
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  // iOS Safari blocks getUserMedia unless it runs inside a tap. We auto-try once,
  // but if that doesn't reach "live" we show a big "Tap to go live" button so the
  // host gets a real user gesture (the fix for "going live did nothing" on iPhone).
  const [showTapPrompt, setShowTapPrompt] = useState(false);

  const start = async (fromTap = false) => {
    setError("");
    if (!window.isSecureContext) {
      setStatus("insecure");
      setError("Camera requires HTTPS.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("no-device");
      setError("Your browser doesn't support camera access.");
      return;
    }
    if (startingRef.current) return; // serialize auto-attempt + tap/retry
    startingRef.current = true;
    manualStopRef.current = false;
    // Drop any half-open room from a previous attempt so we never double-publish.
    await roomRef.current?.disconnect().catch(() => {});
    roomRef.current = null;
    setStatus("connecting");
    try {
      const { token, url } = await fetchToken(streamId, "publisher");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      // Auto-rejoin if the connection drops unexpectedly (e.g. mid-battle network
      // blip). LiveKit retries internally first; this fires only after it gives up.
      room.on(RoomEvent.Disconnected, () => {
        if (manualStopRef.current) return;
        if (roomRef.current !== room) return; // superseded by a newer attempt
        setStatus("connecting");
        start(false);
      });
      await room.connect(url, token);
      const tracks = await createLocalTracks({
        audio: true,
        video: { facingMode: "user", resolution: { width: 1280, height: 720, frameRate: 30 } },
      });
      for (const t of tracks) {
        await room.localParticipant.publishTrack(t);
        if (t.kind === Track.Kind.Video && videoRef.current) {
          t.attach(videoRef.current);
        }
      }
      setShowTapPrompt(false);
      setStatus("live");
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotAllowedError") {
        // Auto-attempt (no gesture) failing on iOS is expected — show the inviting
        // tap button rather than a scary "blocked" screen. Only a *tapped* attempt
        // that still fails means the user truly denied permission.
        if (fromTap) {
          setStatus("denied");
          setError("Allow camera + microphone for this site in your browser settings, then tap Try again.");
        } else {
          setStatus("idle");
          setShowTapPrompt(true);
        }
      } else if (name === "NotFoundError") {
        setStatus("no-device");
        setError("No camera found on this device.");
      } else {
        setStatus("error");
        setError(e?.message ?? "Could not start broadcast.");
      }
    } finally {
      startingRef.current = false;
    }
  };

  const stop = async () => {
    manualStopRef.current = true; // user-initiated — don't auto-rejoin
    await roomRef.current?.disconnect();
    roomRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await roomRef.current?.disconnect();
      if (cancelled) return;
      await start(false);
    })();
    return () => {
      cancelled = true;
      manualStopRef.current = true; // tearing down — don't auto-rejoin
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  // If we don't reach "live" shortly after connecting (e.g. iOS waiting on a
  // gesture), surface the big tap-to-go-live button.
  useEffect(() => {
    if (status !== "connecting") return undefined;
    const t = setTimeout(() => setShowTapPrompt(true), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const toggleCam = () => {
    const p = roomRef.current?.localParticipant as LocalParticipant | undefined;
    const pub = p?.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    if (!pub?.track) return;
    if (camOn) pub.track.mute(); else pub.track.unmute();
    setCamOn(!camOn);
  };
  const toggleMic = () => {
    const p = roomRef.current?.localParticipant as LocalParticipant | undefined;
    const pub = p?.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    if (!pub?.track) return;
    if (micOn) pub.track.mute(); else pub.track.unmute();
    setMicOn(!micOn);
  };

  return (
    <div className="relative w-full h-full bg-black" data-testid="livekit-broadcaster">
      <div
        className="absolute inset-0"
        style={{ filter: filterCss || "none", willChange: "filter", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
          style={{ transform: "scaleX(-1)" }}
        />
      </div>
      {status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 z-30">
          <div className="max-w-sm w-full text-center space-y-3">
            {status === "connecting" && !showTapPrompt && (
              <>
                <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                <p className="text-white font-semibold">Going live…</p>
                <p className="text-xs text-muted-foreground">Allow camera + mic when your browser asks.</p>
              </>
            )}
            {/* Inviting tap-to-go-live (iOS needs a gesture; also a friendly fallback) */}
            {(showTapPrompt || status === "idle") && status !== "denied" && status !== "no-device" && status !== "insecure" && status !== "error" && (
              <button
                onClick={() => start(true)}
                className="mx-auto flex flex-col items-center gap-3 rounded-3xl bg-primary px-10 py-8 text-black font-extrabold text-xl shadow-2xl active:scale-95 transition"
                data-testid="button-go-live-camera"
              >
                <Camera className="w-12 h-12" />
                Tap to go live
                <span className="text-sm font-semibold text-black/70">Turn on your camera &amp; mic</span>
              </button>
            )}
            {(status === "denied" || status === "no-device" || status === "insecure" || status === "error") && (
              <>
                <AlertCircle className="w-10 h-10 mx-auto text-secondary" />
                <p className="text-white font-semibold">
                  {status === "denied" ? "Camera blocked" : status === "no-device" ? "No camera" : status === "insecure" ? "Insecure connection" : "Couldn't start"}
                </p>
                {error && <p className="text-xs text-muted-foreground">{error}</p>}
                <Button onClick={() => start(true)} className="w-full" data-testid="button-retry-broadcast">
                  <Camera className="w-4 h-4 mr-2" /> Try again
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {status === "live" && (
        // Sit above the mobile chat overlay (bottom 26%) so the camera/mic
        // toggles are visible and tappable on phones; bottom-anchored on desktop.
        <div className="absolute bottom-[28%] lg:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          <Button onClick={toggleCam} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-12 w-12" data-testid="button-toggle-cam">
            {camOn ? <Camera className="w-5 h-5 text-white" /> : <CameraOff className="w-5 h-5 text-secondary" />}
          </Button>
          <Button onClick={toggleMic} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-12 w-12" data-testid="button-toggle-mic">
            {micOn ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-secondary" />}
          </Button>
          <Button onClick={stop} size="sm" variant="destructive" className="rounded-full h-10" data-testid="button-end-broadcast">
            End stream
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Viewer's view: subscribes to the host's video + audio.
 */
export function LiveKitViewer({ streamId, posterUrl, fit = "cover" }: { streamId: number; posterUrl?: string; fit?: "cover" | "contain" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const leftRef = useRef(false); // true on unmount — suppresses auto-rejoin
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string>("");
  const [needsUnmute, setNeedsUnmute] = useState(false);

  const attachIfHost = (track: RemoteTrack, participant: RemoteParticipant) => {
    if (!participant.identity.startsWith("host-")) return;
    if (track.kind === Track.Kind.Video && videoRef.current) {
      track.attach(videoRef.current);
      setStatus("live");
    } else if (track.kind === Track.Kind.Audio && audioRef.current) {
      track.attach(audioRef.current);
      audioRef.current.play().catch(() => setNeedsUnmute(true));
    }
  };

  const join = async () => {
    setError("");
    setStatus("connecting");
    leftRef.current = false;
    try {
      const { token, url } = await fetchToken(streamId, "viewer");
      // adaptiveStream off: these tiles are always on-screen; we never want the
      // opponent/host feed paused just because the element is small.
      const room = new Room({ adaptiveStream: false });
      roomRef.current = room;
      // Auto-rejoin if our connection drops (e.g. mid-battle blip). LiveKit
      // retries internally first; this fires only after it gives up.
      room.on(RoomEvent.Disconnected, () => {
        if (leftRef.current) return;
        if (roomRef.current !== room) return; // superseded by a newer attempt
        join();
      });
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attachIfHost(track, participant));
      room.on(RoomEvent.ParticipantConnected, (p) => {
        // host (re)joined — leave "waiting"; video will flip us to "live"
        if (p.identity.startsWith("host-")) setStatus((s) => (s === "live" ? s : "connecting"));
      });
      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        // host left — only show waiting if no other host remains (avoids reconnect flicker)
        if (!p.identity.startsWith("host-")) return;
        const stillHost = Array.from(room.remoteParticipants.values()).some((rp) => rp.identity.startsWith("host-"));
        if (!stillHost) setStatus("waiting");
      });
      await room.connect(url, token);
      // Attach any tracks an existing host already published
      const publishers = Array.from(room.remoteParticipants.values()).filter(
        (p) => p.identity.startsWith("host-"),
      );
      if (publishers.length === 0) {
        setStatus("waiting");
      } else {
        for (const p of publishers) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track) attachIfHost(pub.track, p);
          }
        }
        // host present but no video frame yet — stay "connecting" until it attaches
      }
      // Backstop: flip to live when the first video frame loads
      const vid = videoRef.current;
      if (vid) {
        vid.onloadeddata = () => setStatus("live");
      }
    } catch (e: any) {
      setStatus("error");
      setError(e?.message ?? "Couldn't join stream.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await roomRef.current?.disconnect();
      if (cancelled) return;
      await join();
    })();
    return () => {
      cancelled = true;
      leftRef.current = true; // tearing down — don't auto-rejoin
      const v = videoRef.current;
      if (v) v.onloadeddata = null;
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line read-hooks/exhaustive-deps
  }, [streamId]);

  const unmute = async () => {
    if (audioRef.current) {
      await audioRef.current.play().catch(() => {});
      setNeedsUnmute(false);
    }
  };

  return (
    <div className="relative w-full h-full bg-black" data-testid="livekit-viewer">
      {posterUrl && status !== "live" && (
        <img src={posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50 blur-sm" />
      )}
      <video ref={videoRef} autoPlay playsInline className={`w-full h-full ${fit === "contain" ? "object-contain" : "object-cover"}`} />
      <audio ref={audioRef} autoPlay />
      {status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <div className="text-center space-y-2">
            {status === "connecting" && <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />}
            {status === "waiting" && (
              <>
                <Radio className="w-16 h-16 mx-auto text-secondary animate-pulse" />
                <p className="text-white font-semibold">Waiting for host…</p>
                <p className="text-xs text-muted-foreground">The host hasn't gone live yet.</p>
              </>
            )}
            {status === "error" && (
              <>
                <AlertCircle className="w-12 h-12 mx-auto text-secondary" />
                <p className="text-white font-semibold">Can't connect</p>
                {error && <p className="text-xs text-muted-foreground max-w-xs">{error}</p>}
                <Button onClick={join} size="sm" data-testid="button-retry-viewer">Retry</Button>
              </>
            )}
          </div>
        </div>
      )}
      {needsUnmute && status === "live" && (
        <Button
          onClick={unmute}
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-black/70 backdrop-blur border border-white/20"
          size="sm"
          data-testid="button-unmute"
        >
          <MicOff className="w-4 h-4 mr-2" /> Tap to unmute
        </Button>
      )}
    </div>
  );
}
