import { AccessToken } from "livekit-server-sdk";

const apiKey = process.env["LIVEKIT_API_KEY"] ?? "";
const apiSecret = process.env["LIVEKIT_API_SECRET"] ?? "";
const url = process.env["LIVEKIT_URL"] ?? "";

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
    canPublishData: true,
  });
  return await at.toJwt();
}
