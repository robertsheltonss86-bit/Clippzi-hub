import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  Participant,
  createLocalTracks,
  DataPacket_Kind,
  type LocalTrackPublication,
  type TrackPublication,
} from "livekit-client";
import { Camera, CameraOff, Mic, MicOff, AlertCircle, Loader2, MicIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type RoleResp = { token: string; url: string; isHost: boolean; isCohost: boolean };

async function fetchToken(streamId: number, role: "publisher" | "viewer"): Promise<RoleResp> {
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

// --- Room Context shared across stage / games / cohost panel ---
type RoomCtx = {
  room: Room | null;
  canPublish: boolean;
  isHost: boolean;
  isCohost: boolean;
  participants: Participant[]; // host + cohosts (publishers)
};
const RoomContext = createContext<RoomCtx>({ room: null, canPublish: false, isHost: false, isCohost: false, participants: [] });
export const useGroupRoom = () => useContext(RoomContext);

// Helper to identify publisher (host or cohost) tiles
const isPublisher = (p: Participant) => p.identity.startsWith("host-") || p.identity.startsWith("cohost-");

/** Provider: connects to LiveKit, publishes if allowed, exposes room + publishers list */
export function GroupRoomProvider({ streamId, children }: { streamId: number; children: ReactNode }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [canPublish, setCanPublish] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isCohost, setIsCohost] = useState(false);
  // Refs mirror the latest state for use inside the poll closure (effect deps are [streamId])
  const canPublishRef = useRef(false);
  const isHostRef = useRef(false);
  useEffect(() => { canPublishRef.current = canPublish; }, [canPublish]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    const r = new Room({ adaptiveStream: true, dynacast: true });
    setStatus("connecting");

    const refresh = () => {
      if (cancelled) return;
      const all: Participant[] = [r.localParticipant, ...Array.from(r.remoteParticipants.values())];
      setParticipants(all.filter(isPublisher));
    };

    (async () => {
      try {
        // First try viewer token, then upgrade to publisher if allowed
        const meta = await fetchToken(streamId, "viewer");
        if (cancelled) return;
        let token = meta.token;
        if (meta.isHost || meta.isCohost) {
          const pub = await fetchToken(streamId, "publisher");
          if (cancelled) return;
          token = pub.token;
        }
        setIsHost(meta.isHost);
        setIsCohost(meta.isCohost);
        setCanPublish(meta.isHost || meta.isCohost);

        r.on(RoomEvent.ParticipantConnected, refresh);
        r.on(RoomEvent.ParticipantDisconnected, refresh);
        r.on(RoomEvent.TrackSubscribed, refresh);
        r.on(RoomEvent.TrackUnsubscribed, refresh);
        r.on(RoomEvent.LocalTrackPublished, refresh);
        r.on(RoomEvent.LocalTrackUnpublished, refresh);

        await r.connect(meta.url, token);
        if (cancelled) { r.disconnect(); return; }

        if (meta.isHost || meta.isCohost) {
          try {
            const tracks = await createLocalTracks({
              audio: true,
              video: { facingMode: "user", resolution: { width: 640, height: 360, frameRate: 24 } },
            });
            for (const t of tracks) await r.localParticipant.publishTrack(t);
          } catch (e: any) {
            setError(e?.message || "Camera access blocked.");
          }
        }
        setRoom(r);
        setStatus("connected");
        refresh();
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Couldn't join room.");
          setStatus("error");
        }
      }
    })();

    // Poll cohort status: if we get approved while connected as viewer, reload
    // so we re-mint a publisher token. Uses a guard flag (not state) to avoid
    // a closure-stale reload loop after the upgrade succeeds.
    let pollId: ReturnType<typeof setInterval> | null = null;
    let alreadyUpgraded = false;
    pollId = setInterval(async () => {
      if (cancelled || alreadyUpgraded) return;
      try {
        const r = await fetch(`${import.meta.env.BASE_URL}api/livestreams/${streamId}/cohosts`, { credentials: "include" });
        if (!r.ok) return;
        const d = await r.json();
        const meReq = await fetch(`${import.meta.env.BASE_URL}api/auth/user`, { credentials: "include" }).catch(() => null);
        const me = meReq && meReq.ok ? (await meReq.json())?.appUserId : null;
        if (!me) return;
        const mine = (d.approved || []).find((x: any) => x.userId === me);
        // Read the LATEST refs (effect deps are [streamId] so React state in
        // closure is stale; refs are always current).
        if (mine && !canPublishRef.current && !isHostRef.current) {
          alreadyUpgraded = true;
          window.location.reload();
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      r.removeAllListeners();
      r.disconnect();
    };
  }, [streamId]);

  return (
    <RoomContext.Provider value={{ room, canPublish, isHost, isCohost, participants }}>
      {status === "error" && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 text-white text-xs px-3 py-1 rounded-full">
          {error}
        </div>
      )}
      {children}
    </RoomContext.Provider>
  );
}

// --- Tile for a single publisher ---
function ParticipantTile({ participant, isLocal, filterCss }: { participant: Participant; isLocal: boolean; filterCss?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    let detached = false;
    const attachAll = () => {
      if (detached) return;
      let foundVideo = false;
      participant.trackPublications.forEach((pub: TrackPublication) => {
        if (!pub.track) return;
        if (pub.track.kind === Track.Kind.Video && videoRef.current) {
          pub.track.attach(videoRef.current);
          foundVideo = true;
        } else if (pub.track.kind === Track.Kind.Audio && audioRef.current && !isLocal) {
          pub.track.attach(audioRef.current);
          audioRef.current.play().catch(() => {});
        }
      });
      setHasVideo(foundVideo);
    };
    attachAll();
    const handler = () => attachAll();
    participant.on("trackSubscribed", handler);
    participant.on("trackPublished", handler);
    participant.on("trackUnsubscribed", handler);
    participant.on("trackUnpublished", handler);
    return () => {
      detached = true;
      participant.off("trackSubscribed", handler);
      participant.off("trackPublished", handler);
      participant.off("trackUnsubscribed", handler);
      participant.off("trackUnpublished", handler);
    };
  }, [participant, isLocal]);

  const isHost = participant.identity.startsWith("host-");
  const label = participant.name || (isHost ? "Host" : "Co-host");

  return (
    <div className="relative w-full h-full bg-zinc-950 rounded-lg overflow-hidden border border-white/10" data-testid={`tile-${participant.identity}`}>
      <div
        className="absolute inset-0"
        style={isLocal ? { filter: filterCss || "none", willChange: "filter", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" } : undefined}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
          style={isLocal ? { transform: "scaleX(-1)" } : undefined}
        />
      </div>
      {!isLocal && <audio ref={audioRef} autoPlay />}
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold">
            {label[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
      )}
      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1">
        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${isHost ? "bg-secondary text-white" : "bg-primary/80 text-white"}`}>
          {isHost ? "HOST" : "CO"}
        </span>
        <span className="text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded truncate flex-1">{label}</span>
      </div>
    </div>
  );
}

/** Grid stage: shows up to 15 publisher tiles + on-screen controls if local user is publishing */
export function LiveKitGroupStage({ filterCss }: { filterCss?: string } = {}) {
  const { room, canPublish, participants } = useGroupRoom();
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const toggleCam = () => {
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    if (!pub?.track) return;
    if (camOn) pub.track.mute(); else pub.track.unmute();
    setCamOn(!camOn);
  };
  const toggleMic = () => {
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone) as LocalTrackPublication | undefined;
    if (!pub?.track) return;
    if (micOn) pub.track.mute(); else pub.track.unmute();
    setMicOn(!micOn);
  };

  // Sort: host first, then cohosts
  const sorted = [...participants].sort((a, b) => {
    const ah = a.identity.startsWith("host-") ? 0 : 1;
    const bh = b.identity.startsWith("host-") ? 0 : 1;
    return ah - bh;
  });

  // Grid sizing based on count (1–15)
  const n = Math.max(sorted.length, 1);
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;

  return (
    <div className="absolute inset-0 bg-black flex flex-col">
      {!room ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
          <div>
            <MicIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Waiting for host to join…</p>
          </div>
        </div>
      ) : (
        <div
          className="flex-1 grid gap-1 p-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          data-testid="group-grid"
        >
          {sorted.slice(0, 15).map((p) => {
            const isLocal = p === room.localParticipant;
            return (
              <ParticipantTile key={p.identity} participant={p} isLocal={isLocal} filterCss={isLocal ? filterCss : undefined} />
            );
          })}
        </div>
      )}
      {canPublish && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-30">
          <Button onClick={toggleCam} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10" data-testid="button-group-cam">
            {camOn ? <Camera className="w-4 h-4 text-white" /> : <CameraOff className="w-4 h-4 text-secondary" />}
          </Button>
          <Button onClick={toggleMic} size="icon" variant="secondary" className="rounded-full bg-black/70 backdrop-blur border border-white/20 h-10 w-10" data-testid="button-group-mic">
            {micOn ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4 text-secondary" />}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to send/receive typed game/system payloads over LiveKit data channel.
 * SECURITY: incoming messages are filtered to publishers (host/cohost) only —
 * viewers cannot forge game moves.
 */
export function useRoomData(onMessage: (msg: any, from: Participant | undefined) => void) {
  const { room } = useGroupRoom();
  useEffect(() => {
    if (!room) return;
    const handler = (payload: Uint8Array, participant?: RemoteParticipant) => {
      // Ignore messages from non-publishers (viewers can't forge gameplay)
      if (participant && !isPublisher(participant)) return;
      try {
        const text = new TextDecoder().decode(payload);
        const msg = JSON.parse(text);
        onMessage(msg, participant);
      } catch { /* ignore non-JSON */ }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, onMessage]);

  const send = async (msg: any) => {
    if (!room) return;
    const data = new TextEncoder().encode(JSON.stringify(msg));
    await room.localParticipant.publishData(data, { reliable: true });
  };
  return { send };
}

/**
 * Re-broadcast `payload` whenever a new publisher joins. Used by game state
 * holders so late joiners can hydrate.
 */
export function useRebroadcastOnJoin(payload: any | null) {
  const { room } = useGroupRoom();
  useEffect(() => {
    if (!room || !payload) return;
    const handler = (p: RemoteParticipant) => {
      if (!isPublisher(p)) return;
      // small delay so the new joiner has its listeners wired
      setTimeout(() => {
        const data = new TextEncoder().encode(JSON.stringify(payload));
        room.localParticipant.publishData(data, { reliable: true }).catch(() => {});
      }, 600);
    };
    room.on(RoomEvent.ParticipantConnected, handler);
    return () => { room.off(RoomEvent.ParticipantConnected, handler); };
  }, [room, payload]);
}
