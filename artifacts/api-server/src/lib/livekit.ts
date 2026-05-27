import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

const apiKey = process.env["LIVEKIT_API_KEY"] ?? "";
const apiSecret = process.env["LIVEKIT_API_SECRET"] ?? "";
const url = process.env["LIVEKIT_URL"] ?? "";

// LiveKit RoomService expects an HTTPS URL (not wss://)
function httpUrl(): string {
  return url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

let _svc: RoomServiceClient | null = null;
function svc(): RoomServiceClient | null {
  if (!livekitConfigured()) return null;
  if (!_svc) _svc = new RoomServiceClient(httpUrl(), apiKey, apiSecret);
  return _svc;
}

/** Kick a participant from a LiveKit room (best-effort; ignores errors). */
export async function removeLivekitParticipant(roomName: string, identityPrefix: string) {
  const client = svc();
  if (!client) return;
  try {
    const ps = await client.listParticipants(roomName);
    for (const p of ps) {
      if (p.identity.startsWith(identityPrefix)) {
        await client.removeParticipant(roomName, p.identity).catch(() => {});
      }
    }
  } catch { /* room may not exist yet */ }
}

export function livekitConfigured(): boolean {
  return !!(apiKey && apiSecret && url);
}

export function getLivekitUrl(): string {
  return url;
}

export async function mintLivekitToken(opts: {
  roomName: string;
  identity: string;
  name: string;
  canPublish: boolean;
}): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    ttl: "2h",
  });
  at.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish: opts.canPublish,
    canSubscribe: true,
    // Only publishers (host/cohosts) can send data messages — viewers cannot forge gameplay
    canPublishData: opts.canPublish,
  });
  return await at.toJwt();
}
