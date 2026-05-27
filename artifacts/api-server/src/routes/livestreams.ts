import { Router } from "express";
import { db } from "@workspace/db";
import { livestreamsTable, usersTable, liveChatMessagesTable, livestreamCohostsTable } from "@workspace/db";
import { and } from "drizzle-orm";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/authMiddleware";
import { livekitConfigured, getLivekitUrl, mintLivekitToken } from "../lib/livekit";
import {
  ListLivestreamsQueryParams,
  StartLivestreamBody,
  GetLivestreamParams,
  UpdateLivestreamParams,
  UpdateLivestreamBody,
  GetLivestreamViewersParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichStream(stream: typeof livestreamsTable.$inferSelect) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, stream.userId));
  return {
    ...stream,
    totalGiftsReceived: Number(stream.totalGiftsReceived),
    likeCount: Number(stream.likeCount ?? 0),
    battleScore: Number(stream.battleScore),
    battleOpponentScore: Number(stream.battleOpponentScore),
    user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
    createdAt: stream.createdAt.toISOString(),
    startedAt: stream.startedAt?.toISOString() ?? null,
    endedAt: stream.endedAt?.toISOString() ?? null,
    battleEndsAt: stream.battleEndsAt?.toISOString() ?? null,
  };
}

function genInviteCode(): string {
  // Friendly 6-char code, no confusing chars
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// GET /livestreams
router.get("/livestreams", async (req, res) => {
  try {
    const query = ListLivestreamsQueryParams.parse(req.query);
    const streams = await db.select().from(livestreamsTable)
      .where(eq(livestreamsTable.status, "live"))
      .orderBy(desc(livestreamsTable.viewerCount))
      .limit(query.limit ?? 20);
    res.json(await Promise.all(streams.map(enrichStream)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams
router.post("/livestreams", async (req, res) => {
  try {
    const body = StartLivestreamBody.parse(req.body);
    const streamKey = `sk_${Math.random().toString(36).substring(2)}`;
    const mode = (req.body?.mode === "group") ? "group" : "solo";
    const inviteCode = mode === "group" ? genInviteCode() : null;
    const [stream] = await db.insert(livestreamsTable).values({
      userId: body.userId,
      title: body.title,
      description: body.description ?? null,
      thumbnailUrl: body.thumbnailUrl ?? null,
      category: body.category ?? null,
      streamKey,
      playbackUrl: `https://stream.clippzi.com/live/${streamKey}`,
      status: "live",
      viewerCount: 0,
      startedAt: new Date(),
      mode,
      inviteCode,
    }).returning();
    await db.update(usersTable).set({ isLive: true }).where(eq(usersTable.id, body.userId));
    res.status(201).json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /livestreams/:id
router.get("/livestreams/:id", async (req, res) => {
  try {
    const { id } = GetLivestreamParams.parse({ id: Number(req.params.id) });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    await db.update(livestreamsTable).set({ viewerCount: sql`${livestreamsTable.viewerCount} + 1` }).where(eq(livestreamsTable.id, id));
    res.json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /livestreams/:id
router.patch("/livestreams/:id", async (req, res) => {
  try {
    const { id } = UpdateLivestreamParams.parse({ id: Number(req.params.id) });
    const body = UpdateLivestreamBody.parse(req.body);
    const updateData: Partial<typeof livestreamsTable.$inferInsert> = {};
    if (body.title) updateData.title = body.title;
    if (body.description) updateData.description = body.description;
    if (body.activeFilter !== undefined) updateData.activeFilter = body.activeFilter;
    if (body.thumbnailUrl) updateData.thumbnailUrl = body.thumbnailUrl;
    if (body.status) {
      updateData.status = body.status as "live" | "ended";
      if (body.status === "ended") {
        updateData.endedAt = new Date();
        const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
        if (stream) {
          await db.update(usersTable).set({ isLive: false }).where(eq(usersTable.id, stream.userId));
        }
      }
    }
    const [stream] = await db.update(livestreamsTable).set(updateData).where(eq(livestreamsTable.id, id)).returning();
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    res.json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/battle - start battle
router.post("/livestreams/:id/battle", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { opponentStreamId, durationSeconds } = req.body as { opponentStreamId: number; durationSeconds: number };
    if (!Number.isFinite(id) || !Number.isFinite(opponentStreamId)) return res.status(400).json({ error: "Invalid id" });
    if (id === opponentStreamId) return res.status(400).json({ error: "Cannot battle yourself" });
    const dur = Math.min(Math.max(Number(durationSeconds) || 180, 30), 600);
    const endsAt = new Date(Date.now() + dur * 1000);

    const result = await db.transaction(async (tx) => {
      const [me] = await tx.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
      const [opp] = await tx.select().from(livestreamsTable).where(eq(livestreamsTable.id, opponentStreamId));
      if (!me || !opp) return { error: "Stream not found", status: 404 as const };
      if (me.status !== "live" || opp.status !== "live") return { error: "Both streams must be live", status: 400 as const };
      if (me.battleOpponentId || opp.battleOpponentId) return { error: "One of the streams is already in a battle", status: 409 as const };
      const [updatedMe] = await tx.update(livestreamsTable).set({
        battleOpponentId: opponentStreamId,
        battleScore: "0",
        battleOpponentScore: "0",
        battleEndsAt: endsAt,
      }).where(eq(livestreamsTable.id, id)).returning();
      await tx.update(livestreamsTable).set({
        battleOpponentId: id,
        battleScore: "0",
        battleOpponentScore: "0",
        battleEndsAt: endsAt,
      }).where(eq(livestreamsTable.id, opponentStreamId));
      return { stream: updatedMe };
    });
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    res.json(await enrichStream(result.stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /livestreams/:id/battle - end battle
router.delete("/livestreams/:id/battle", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [current] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!current) return res.status(404).json({ error: "Stream not found" });
    const opp = current.battleOpponentId;
    const [stream] = await db.update(livestreamsTable).set({
      battleOpponentId: null,
      battleEndsAt: null,
    }).where(eq(livestreamsTable.id, id)).returning();
    if (opp) {
      await db.update(livestreamsTable).set({
        battleOpponentId: null,
        battleEndsAt: null,
      }).where(eq(livestreamsTable.id, opp));
    }
    res.json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/battle/score - add to score
router.post("/livestreams/:id/battle/score", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { points } = req.body as { points: number };
    const pts = Number(points);
    if (!Number.isFinite(id) || !Number.isFinite(pts)) return res.status(400).json({ error: "Invalid" });
    if (pts <= 0 || pts > 1000) return res.status(400).json({ error: "Points must be between 0 and 1000" });

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
      if (!current) return { error: "Stream not found", status: 404 as const };
      if (!current.battleOpponentId || !current.battleEndsAt) return { error: "No active battle", status: 409 as const };
      if (new Date(current.battleEndsAt).getTime() <= Date.now()) return { error: "Battle has expired", status: 409 as const };
      const [stream] = await tx.update(livestreamsTable).set({
        battleScore: sql`${livestreamsTable.battleScore} + ${pts}`,
      }).where(eq(livestreamsTable.id, id)).returning();
      await tx.update(livestreamsTable).set({
        battleOpponentScore: sql`${livestreamsTable.battleOpponentScore} + ${pts}`,
      }).where(eq(livestreamsTable.id, current.battleOpponentId));
      return { stream };
    });
    if ("error" in result) return res.status(result.status).json({ error: result.error });
    res.json(await enrichStream(result.stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// Simple in-memory token-bucket rate limiter (per key)
const rateBuckets = new Map<string, { tokens: number; last: number }>();
function rateLimit(key: string, capacity: number, refillPerSec: number): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key) ?? { tokens: capacity, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.last = now;
  if (b.tokens < 1) { rateBuckets.set(key, b); return false; }
  b.tokens -= 1;
  rateBuckets.set(key, b);
  return true;
}
function clientKey(req: any): string {
  return String(req.user?.appUserId ?? req.ip ?? "anon");
}

// POST /livestreams/:id/like — tap-to-like (rate limited)
router.post("/livestreams/:id/like", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    // Allow bursts of 10 taps, sustained 5/sec per client+stream
    if (!rateLimit(`like:${clientKey(req)}:${id}`, 10, 5)) {
      return res.status(429).json({ error: "Slow down" });
    }
    const [stream] = await db.update(livestreamsTable)
      .set({ likeCount: sql`${livestreamsTable.likeCount} + 1` })
      .where(eq(livestreamsTable.id, id))
      .returning();
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    res.json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /livestreams/:id/chat
router.get("/livestreams/:id/chat", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const rows = await db.select().from(liveChatMessagesTable)
      .where(eq(liveChatMessagesTable.streamId, id))
      .orderBy(desc(liveChatMessagesTable.id))
      .limit(limit);
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));
    const users = userIds.length
      ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const userMap = new Map(users.map((u) => [u.id, { ...u, createdAt: u.createdAt.toISOString() }]));
    const messages = rows
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        streamId: m.streamId,
        userId: m.userId,
        user: userMap.get(m.userId) ?? null,
        message: m.message,
        createdAt: m.createdAt.toISOString(),
      }));
    res.json(messages);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/chat
router.post("/livestreams/:id/chat", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const userId = req.user?.appUserId;
    if (!userId) return res.status(401).json({ error: "Login required" });
    // Chat: burst 5, sustained 1/sec per user+stream
    if (!rateLimit(`chat:${userId}:${id}`, 5, 1)) {
      return res.status(429).json({ error: "Slow down — too many messages" });
    }
    const raw = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!raw) return res.status(400).json({ error: "Message required" });
    if (raw.length > 500) return res.status(400).json({ error: "Message too long" });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    const [msg] = await db.insert(liveChatMessagesTable).values({
      streamId: id,
      userId,
      message: raw,
    }).returning();
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    res.status(201).json({
      id: msg.id,
      streamId: msg.streamId,
      userId: msg.userId,
      user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
      message: msg.message,
      createdAt: msg.createdAt.toISOString(),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/livekit-token — mint a LiveKit token for broadcaster (host) or viewer
router.post("/livestreams/:id/livekit-token", async (req, res) => {
  try {
    if (!livekitConfigured()) {
      return res.status(503).json({ error: "Live streaming not configured" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    const me = req.user?.appUserId;
    const isHost = !!me && me === stream.userId;
    // Check approved cohost (group mode)
    let isCohost = false;
    if (!isHost && me && stream.mode === "group") {
      const [cohost] = await db.select().from(livestreamCohostsTable)
        .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, me), eq(livestreamCohostsTable.status, "approved")));
      isCohost = !!cohost;
    }
    const canPublish = isHost || isCohost;
    if (req.body?.role === "publisher" && !canPublish) {
      return res.status(403).json({ error: "Not authorized to publish to this stream" });
    }
    const rand = Math.random().toString(36).slice(2, 10);
    // Role-encoded, collision-safe identity. Host: `host-`, cohost: `cohost-`.
    const identity = isHost
      ? `host-${id}-${me}`
      : isCohost
        ? `cohost-${id}-${me}`
        : me
          ? `viewer-${me}-${rand}`
          : `guest-${rand}`;
    const [meUser] = me ? await db.select().from(usersTable).where(eq(usersTable.id, me)) : [null];
    const name = meUser?.displayName || meUser?.username || "Guest";
    const token = await mintLivekitToken({
      roomName: `stream-${id}`,
      identity,
      name,
      canPublish,
    });
    res.json({ token, url: getLivekitUrl(), isHost, isCohost, identity });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ===== Co-host (group live) endpoints =====

// GET /livestreams/:id/cohosts — list approved cohosts (+ pending if you're host)
router.get("/livestreams/:id/cohosts", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    const me = req.user?.appUserId;
    const isHost = !!me && me === stream.userId;
    const rows = await db.select().from(livestreamCohostsTable).where(eq(livestreamCohostsTable.streamId, id));
    const userIds = rows.map(r => r.userId);
    const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
    const userMap = new Map(users.map(u => [u.id, u]));
    const enriched = rows.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      user: userMap.get(r.userId) ? { ...userMap.get(r.userId)!, createdAt: userMap.get(r.userId)!.createdAt.toISOString() } : null,
    }));
    res.json({
      mode: stream.mode,
      maxCohosts: stream.maxCohosts,
      inviteCode: isHost ? stream.inviteCode : null,
      approved: enriched.filter(r => r.status === "approved"),
      pending: isHost ? enriched.filter(r => r.status === "pending") : [],
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/cohosts/request — viewer asks to join
router.post("/livestreams/:id/cohosts/request", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.mode !== "group") return res.status(400).json({ error: "Stream is not a group live" });
    if (stream.userId === me) return res.status(400).json({ error: "You are the host" });
    const approvedCount = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.status, "approved")));
    if (approvedCount.length >= stream.maxCohosts) return res.status(409).json({ error: "Group is full" });
    // Upsert request as pending (unless already approved)
    const [existing] = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, me)));
    if (existing) {
      if (existing.status === "approved") return res.json({ status: "approved" });
      if (existing.status === "pending") return res.json({ status: "pending" });
      // rejected -> retry
      await db.update(livestreamCohostsTable).set({ status: "pending" }).where(eq(livestreamCohostsTable.id, existing.id));
      return res.json({ status: "pending" });
    }
    await db.insert(livestreamCohostsTable).values({ streamId: id, userId: me, status: "pending" });
    res.json({ status: "pending" });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/cohosts/join-by-code — { code }
router.post("/livestreams/:id/cohosts/join-by-code", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const me = req.user!.appUserId;
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Code required" });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.mode !== "group") return res.status(400).json({ error: "Stream is not a group live" });
    if (!stream.inviteCode || stream.inviteCode !== code) return res.status(403).json({ error: "Invalid code" });
    if (stream.userId === me) return res.status(400).json({ error: "You are the host" });
    const approvedCount = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.status, "approved")));
    if (approvedCount.length >= stream.maxCohosts) return res.status(409).json({ error: "Group is full" });
    const [existing] = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, me)));
    if (existing) {
      if (existing.status !== "approved") {
        await db.update(livestreamCohostsTable).set({ status: "approved" }).where(eq(livestreamCohostsTable.id, existing.id));
      }
    } else {
      await db.insert(livestreamCohostsTable).values({ streamId: id, userId: me, status: "approved" });
    }
    res.json({ status: "approved" });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/cohosts/:userId/approve — host approves
router.post("/livestreams/:id/cohosts/:userId/approve", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.userId !== me) return res.status(403).json({ error: "Only host can approve" });
    const approvedCount = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.status, "approved")));
    if (approvedCount.length >= stream.maxCohosts) return res.status(409).json({ error: "Group is full" });
    await db.update(livestreamCohostsTable).set({ status: "approved" })
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, targetUserId)));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/cohosts/:userId/reject — host rejects
router.post("/livestreams/:id/cohosts/:userId/reject", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.userId !== me) return res.status(403).json({ error: "Only host can reject" });
    await db.update(livestreamCohostsTable).set({ status: "rejected" })
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, targetUserId)));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /livestreams/:id/cohosts/:userId — host removes OR self-leave
router.delete("/livestreams/:id/cohosts/:userId", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.userId !== me && targetUserId !== me) return res.status(403).json({ error: "Forbidden" });
    await db.delete(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, targetUserId)));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /livestreams/:id/viewers
router.get("/livestreams/:id/viewers", async (req, res) => {
  try {
    const { id } = GetLivestreamViewersParams.parse({ id: Number(req.params.id) });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    // Return top users as sample viewers
    const viewers = await db.select().from(usersTable).limit(stream.viewerCount || 5);
    res.json({
      streamId: id,
      viewerCount: stream.viewerCount,
      viewers: viewers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
