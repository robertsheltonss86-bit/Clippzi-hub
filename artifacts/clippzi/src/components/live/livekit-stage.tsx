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
export function LiveKitBroadcaster({ streamId }: { streamId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const start = async () => {
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
    setStatus("connecting");
    try {
      const { token, url } = await fetchToken(streamId, "publisher");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
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
      setStatus("live");
    } catch (e: any) {
      const name = e?.name ?? "";
      if (name === "NotAllowedError") {
        setStatus("denied");
        setError("Camera access denied. Allow camera + microphone in your browser settings.");
      } else if (name === "NotFoundError") {
        setStatus("no-device");
        setError("No camera found on this device.");
      } else {
        setStatus("error");
        setError(e?.message ?? "Could not start broadcast.");
      }
    }
  };

  const stop = async () => {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  };

  useEffect(() => {
    start();
    return () => { roomRef.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

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
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ transform: "scaleX(-1)" }}
      />
      {status !== "live" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6 z-30">
          <div className="max-w-sm w-full text-center space-y-3">
            {status === "connecting" && (
              <>
                <Loader2 className="w-10 h-10 mx-auto text-primary animate-spin" />
                <p className="text-white font-semibold">Going live…</p>
                <p className="text-xs text-muted-foreground">Allow camera + mic when your browser asks.</p>
              </>
            )}
            {status !== "connecting" && status !== "live" && (
              <>
                <AlertCircle className="w-10 h-10 mx-auto text-secondary" />
                <p className="text-white font-semibold">
                  {status === "denied" ? "Camera blocked" : status === "no-device" ? "No camera" : status === "insecure" ? "Insecure connection" : "Couldn't start"}
                </p>
                {error && <p className="text-xs text-muted-foreground">{error}</p>}
                <Button onClick={start} className="w-full" data-testid="button-retry-broadcast">
                  <Camera className="w-4 h-4 mr-2" /> Try again
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {status === "live" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-30">
          <Button onClick={toggleCam} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10" data-testid="button-toggle-cam">
            {camOn ? <Camera className="w-4 h-4 text-white" /> : <CameraOff className="w-4 h-4 text-secondary" />}
          </Button>
          <Button onClick={toggleMic} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10" data-testid="button-toggle-mic">
            {micOn ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-secondary" />}
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
export function LiveKitViewer({ streamId, posterUrl }: { streamId: number; posterUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string>("");
  const [needsUnmute, setNeedsUnmute] = useState(false);

  const attachIfHost = (track: RemoteTrack, participant: RemoteParticipant) => {
    if (participant.identity.startsWith("guest-")) return;
    if (track.kind === Track.Kind.Video && videoRef.current) {
      track.attach(videoRef.current);
    } else if (track.kind === Track.Kind.Audio && audioRef.current) {
      track.attach(audioRef.current);
      audioRef.current.play().catch(() => setNeedsUnmute(true));
    }
  };

  const join = async () => {
    setError("");
    setStatus("connecting");
    try {
      const { token, url } = await fetchToken(streamId, "viewer");
      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => attachIfHost(track, participant));
      room.on(RoomEvent.ParticipantConnected, (p) => {
        // refresh waiting state when host joins
        if (!p.identity.startsWith("guest-")) setStatus("connecting");
      });
      await room.connect(url, token);
      // Find an existing remote publisher
      const publishers = Array.from(room.remoteParticipants.values()).filter(
        (p) => !p.identity.startsWith("guest-"),
      );
      if (publishers.length === 0) {
        setStatus("waiting");
      } else {
        for (const p of publishers) {
          for (const pub of p.trackPublications.values()) {
            if (pub.track) attachIfHost(pub.track, p);
          }
        }
        setStatus("live");
      }
      // Flip to live when first video frame attaches
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
    join();
    return () => { roomRef.current?.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
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
