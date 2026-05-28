import { Router } from "express";
import { db } from "@workspace/db";
import { livestreamsTable, usersTable, liveChatMessagesTable, livestreamCohostsTable, livestreamBattleRequestsTable, moderationReportsTable } from "@workspace/db";
import { and } from "drizzle-orm";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { requireAuth, requireNotSuspended } from "../middlewares/authMiddleware";
import { moderateText, flagToReportReason, GUIDELINES_BLOCK_MESSAGE } from "../lib/moderation";
import { livekitConfigured, getLivekitUrl, mintLivekitToken, removeLivekitParticipant } from "../lib/livekit";
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

// In-memory host heartbeats. Touched on every host livekit-token request.
// Any "live" stream whose last heartbeat is older than HEARTBEAT_TIMEOUT_MS is auto-ended.
const hostHeartbeats = new Map<number, number>();
const HEARTBEAT_TIMEOUT_MS = 90_000; // 90 seconds without a host token request = stale
const NO_HEARTBEAT_GRACE_MS = 300_000; // 5 min after start to first heartbeat

export function touchHostHeartbeat(streamId: number) {
  hostHeartbeats.set(streamId, Date.now());
}

async function sweepStaleStreams() {
  try {
    const now = Date.now();
    const liveStreams = await db.select().from(livestreamsTable).where(eq(livestreamsTable.status, "live"));
    const staleIds: number[] = [];
    for (const s of liveStreams) {
      const beat = hostHeartbeats.get(s.id);
      if (beat) {
        // Only end if a beat exists AND it's older than the timeout. This avoids
        // false positives after a server restart (where in-memory beats are lost).
        if (now - beat > HEARTBEAT_TIMEOUT_MS) staleIds.push(s.id);
      } else {
        // Seed a beat so the next sweep can judge fairly. Never end on first sight.
        hostHeartbeats.set(s.id, now);
      }
    }
    if (staleIds.length > 0) {
      await db.update(livestreamsTable)
        .set({ status: "ended", endedAt: new Date() })
        .where(and(eq(livestreamsTable.status, "live"), inArray(livestreamsTable.id, staleIds)));
      const staleUserIds = liveStreams.filter(s => staleIds.includes(s.id)).map(s => s.userId);
      if (staleUserIds.length > 0) {
        await db.update(usersTable).set({ isLive: false }).where(inArray(usersTable.id, staleUserIds));
      }
      for (const id of staleIds) hostHeartbeats.delete(id);
    }
  } catch (e) {
    // best-effort — never fail the request because of sweep
    console.error("sweepStaleStreams error", e);
  }
}

// GET /livestreams
router.get("/livestreams", async (req, res) => {
  try {
    await sweepStaleStreams();
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
router.post("/livestreams", requireAuth, requireNotSuspended, async (req, res) => {
  try {
    const body = StartLivestreamBody.parse(req.body);
    // Security: stream owner is always the authenticated user (ignore client-supplied userId)
    const ownerId = req.user!.appUserId;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });
    // Auto-end any of this user's prior live streams so they don't pile up as "ghost" lives.
    await db.update(livestreamsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(livestreamsTable.userId, ownerId), eq(livestreamsTable.status, "live")));
    const streamKey = `sk_${Math.random().toString(36).substring(2)}`;
    const mode = (req.body?.mode === "group") ? "group" : "solo";
    const inviteCode = mode === "group" ? genInviteCode() : null;
    const [stream] = await db.insert(livestreamsTable).values({
      userId: ownerId,
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
    await db.update(usersTable).set({ isLive: true }).where(eq(usersTable.id, ownerId));
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
    // If the requester is the host and the stream is live, record a heartbeat
    // so the stale-stream sweeper knows this stream is still active.
    if (stream.status === "live" && req.user?.appUserId === stream.userId) {
      touchHostHeartbeat(id);
    }
    await db.update(livestreamsTable).set({ viewerCount: sql`${livestreamsTable.viewerCount} + 1` }).where(eq(livestreamsTable.id, id));
    res.json(await enrichStream(stream));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /livestreams/:id — host-only
router.patch("/livestreams/:id", requireAuth, async (req, res) => {
  try {
    const { id } = UpdateLivestreamParams.parse({ id: Number(req.params.id) });
    const body = UpdateLivestreamBody.parse(req.body);
    const me = req.user!.appUserId;
    const [existing] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Stream not found" });
    if (existing.userId !== me) return res.status(403).json({ error: "Only the host can update this stream" });
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
    if ("error" in result) return res.status(result.status ?? 400).json({ error: result.error });
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
    if ("error" in result) return res.status(result.status ?? 400).json({ error: result.error });
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
router.post("/livestreams/:id/chat", requireAuth, requireNotSuspended, async (req, res) => {
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
    const mod = await moderateText(raw);
    if (mod.decision === "block") {
      return res.status(422).json({ error: GUIDELINES_BLOCK_MESSAGE });
    }
    const [msg] = await db.insert(liveChatMessagesTable).values({
      streamId: id,
      userId,
      message: raw,
    }).returning();
    if (mod.decision === "flag") {
      await db.insert(moderationReportsTable).values({
        contentType: "stream",
        contentId: msg.id,
        reason: flagToReportReason(mod.flags),
        description: `Auto-flagged live chat by AI moderation: ${mod.reason ?? "borderline content"}`,
        status: "pending",
        aiScore: String(mod.score),
        aiFlags: mod.flags,
      });
    }
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
    if (isHost && stream.status === "live") touchHostHeartbeat(id);
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
    // Additive, backwards-compatible: tell the caller their own request status so a
    // non-host viewer can reconcile pending/rejected (the API never exposes a
    // non-host's pending/rejected row in the lists below).
    const myRow = me ? enriched.find(r => r.userId === me) : undefined;
    res.json({
      mode: stream.mode,
      maxCohosts: stream.maxCohosts,
      inviteCode: isHost ? stream.inviteCode : null,
      approved: enriched.filter(r => r.status === "approved"),
      pending: isHost ? enriched.filter(r => r.status === "pending") : [],
      me: me ? { status: myRow?.status ?? "none" } : null,
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
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.mode !== "group") return res.status(400).json({ error: "Stream is not a group live" });
    if (stream.userId === me) return res.status(400).json({ error: "You are the host" });
    // Pending requests don't take a slot — only check capacity at approve/join-by-code
    const [existing] = await db.select().from(livestreamCohostsTable)
      .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, me)));
    if (existing) {
      if (existing.status === "approved") return res.json({ status: "approved" });
      if (existing.status === "pending") return res.json({ status: "pending" });
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
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Code required" });
    // Atomic capacity check + approve in a single transaction with row lock
    const result = await db.transaction(async (tx) => {
      const [stream] = await tx.execute(sql`
        SELECT id, user_id AS "userId", mode, invite_code AS "inviteCode", max_cohosts AS "maxCohosts"
        FROM livestreams WHERE id = ${id} FOR UPDATE
      `).then((r: any) => (r.rows ?? r) as any[]);
      if (!stream) return { code: 404, body: { error: "Stream not found" } };
      if (stream.mode !== "group") return { code: 400, body: { error: "Stream is not a group live" } };
      if (!stream.inviteCode || stream.inviteCode !== code) return { code: 403, body: { error: "Invalid code" } };
      if (stream.userId === me) return { code: 400, body: { error: "You are the host" } };
      const approved = await tx.select().from(livestreamCohostsTable)
        .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.status, "approved")));
      const [mine] = await tx.select().from(livestreamCohostsTable)
        .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, me)));
      if (mine?.status === "approved") return { code: 200, body: { status: "approved" } };
      if (approved.length >= stream.maxCohosts) return { code: 409, body: { error: "Group is full" } };
      if (mine) {
        await tx.update(livestreamCohostsTable).set({ status: "approved" })
          .where(eq(livestreamCohostsTable.id, mine.id));
      } else {
        await tx.insert(livestreamCohostsTable).values({ streamId: id, userId: me, status: "approved" });
      }
      return { code: 200, body: { status: "approved" } };
    });
    res.status(result.code).json(result.body);
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
    // Atomic: lock stream row, check capacity, set approved
    const result = await db.transaction(async (tx) => {
      const lockRows = await tx.execute(sql`
        SELECT id, user_id AS "userId", max_cohosts AS "maxCohosts"
        FROM livestreams WHERE id = ${id} FOR UPDATE
      `).then((r: any) => (r.rows ?? r) as any[]);
      const stream = lockRows[0];
      if (!stream) return { code: 404, body: { error: "Stream not found" } };
      if (stream.userId !== me) return { code: 403, body: { error: "Only host can approve" } };
      const approved = await tx.select().from(livestreamCohostsTable)
        .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.status, "approved")));
      const [target] = await tx.select().from(livestreamCohostsTable)
        .where(and(eq(livestreamCohostsTable.streamId, id), eq(livestreamCohostsTable.userId, targetUserId)));
      if (target?.status === "approved") return { code: 200, body: { ok: true } };
      if (approved.length >= stream.maxCohosts) return { code: 409, body: { error: "Group is full" } };
      if (!target) return { code: 404, body: { error: "No request found" } };
      await tx.update(livestreamCohostsTable).set({ status: "approved" })
        .where(eq(livestreamCohostsTable.id, target.id));
      return { code: 200, body: { ok: true } };
    });
    res.status(result.code).json(result.body);
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
    // Kick from LiveKit room so they immediately lose publish rights (token TTL is 2h)
    await removeLivekitParticipant(`stream-${id}`, `cohost-${id}-${targetUserId}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/enable-group — host converts solo → group (mints invite code)
router.post("/livestreams/:id/enable-group", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.userId !== me) return res.status(403).json({ error: "Only the host can enable group mode" });
    const inviteCode = stream.inviteCode || genInviteCode();
    const [updated] = await db.update(livestreamsTable).set({
      mode: "group",
      inviteCode,
    }).where(eq(livestreamsTable.id, id)).returning();
    res.json(await enrichStream(updated));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// ===== Battle requests (request → accept/reject → start) =====

// POST /livestreams/:id/battle/request — { opponentStreamId, durationSeconds? }
router.post("/livestreams/:id/battle/request", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const me = req.user!.appUserId;
    const opponentStreamId = Number(req.body?.opponentStreamId);
    const durationSeconds = Math.min(Math.max(Number(req.body?.durationSeconds) || 180, 30), 600);
    if (!Number.isFinite(id) || !Number.isFinite(opponentStreamId)) return res.status(400).json({ error: "Invalid id" });
    if (id === opponentStreamId) return res.status(400).json({ error: "Cannot battle yourself" });
    // Atomic dedup via unique partial index (from_stream_id, to_stream_id) WHERE status='pending'.
    // Lock both stream rows in deterministic id order to avoid deadlocks.
    const result = await db.transaction(async (tx) => {
      const [a, b] = id < opponentStreamId ? [id, opponentStreamId] : [opponentStreamId, id];
      const lockRows = await tx.execute(sql`
        SELECT id, user_id AS "userId", status, battle_opponent_id AS "battleOpponentId"
        FROM livestreams WHERE id IN (${a}, ${b}) FOR UPDATE
      `).then((r: any) => (r.rows ?? r) as any[]);
      const me_stream = lockRows.find((s: any) => s.id === id);
      const opp = lockRows.find((s: any) => s.id === opponentStreamId);
      if (!me_stream || !opp) return { code: 404, body: { error: "Stream not found" } };
      if (me_stream.userId !== me) return { code: 403, body: { error: "Only the host can request a battle" } };
      if (me_stream.status !== "live" || opp.status !== "live") return { code: 400, body: { error: "Both streams must be live" } };
      if (me_stream.battleOpponentId || opp.battleOpponentId) return { code: 409, body: { error: "One of the streams is already in a battle" } };
      // Insert with ON CONFLICT DO NOTHING on the partial unique index — safe under races
      const inserted: any = await tx.execute(sql`
        INSERT INTO livestream_battle_requests (from_stream_id, to_stream_id, status, duration_seconds)
        VALUES (${id}, ${opponentStreamId}, 'pending', ${durationSeconds})
        ON CONFLICT (from_stream_id, to_stream_id) WHERE status = 'pending' DO NOTHING
        RETURNING id
      `).then((r: any) => (r.rows ?? r) as any[]);
      if (inserted.length > 0) return { code: 200, body: { status: "pending", id: inserted[0].id } };
      // Duplicate: return existing pending row
      const [existing] = await tx.select().from(livestreamBattleRequestsTable)
        .where(and(
          eq(livestreamBattleRequestsTable.fromStreamId, id),
          eq(livestreamBattleRequestsTable.toStreamId, opponentStreamId),
          eq(livestreamBattleRequestsTable.status, "pending"),
        ));
      return { code: 200, body: { status: "pending", id: existing?.id } };
    });
    res.status(result.code).json(result.body);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /livestreams/:id/battle/requests — list incoming + outgoing pending for this stream (host-only)
router.get("/livestreams/:id/battle/requests", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const me = req.user!.appUserId;
    const [stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    if (stream.userId !== me) return res.status(403).json({ error: "Only the host can view battle requests" });
    const incoming = await db.select().from(livestreamBattleRequestsTable)
      .where(and(eq(livestreamBattleRequestsTable.toStreamId, id), eq(livestreamBattleRequestsTable.status, "pending")));
    const outgoing = await db.select().from(livestreamBattleRequestsTable)
      .where(and(eq(livestreamBattleRequestsTable.fromStreamId, id), eq(livestreamBattleRequestsTable.status, "pending")));
    const streamIds = Array.from(new Set([...incoming.map(r => r.fromStreamId), ...outgoing.map(r => r.toStreamId)]));
    const streams = streamIds.length ? await db.select().from(livestreamsTable).where(inArray(livestreamsTable.id, streamIds)) : [];
    const userIds = streams.map(s => s.userId);
    const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
    const streamMap = new Map(streams.map(s => [s.id, s]));
    const userMap = new Map(users.map(u => [u.id, u]));
    const enrich = (r: any, otherStreamId: number) => {
      const s = streamMap.get(otherStreamId);
      const u = s ? userMap.get(s.userId) : null;
      return {
        id: r.id,
        fromStreamId: r.fromStreamId,
        toStreamId: r.toStreamId,
        durationSeconds: r.durationSeconds,
        createdAt: r.createdAt.toISOString(),
        otherStream: s ? {
          id: s.id, title: s.title, thumbnailUrl: s.thumbnailUrl, userId: s.userId,
          user: u ? { id: u.id, displayName: u.displayName, username: u.username, avatarUrl: u.avatarUrl } : null,
        } : null,
      };
    };
    res.json({
      incoming: incoming.map(r => enrich(r, r.fromStreamId)),
      outgoing: outgoing.map(r => enrich(r, r.toStreamId)),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/battle/requests/:requestId/accept — accept incoming request and start battle
router.post("/livestreams/:id/battle/requests/:requestId/accept", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requestId = Number(req.params.requestId);
    const me = req.user!.appUserId;
    const result = await db.transaction(async (tx) => {
      // Lock the request row first
      const reqLocked: any = await tx.execute(sql`
        SELECT id, from_stream_id AS "fromStreamId", to_stream_id AS "toStreamId", status, duration_seconds AS "durationSeconds"
        FROM livestream_battle_requests WHERE id = ${requestId} FOR UPDATE
      `).then((r: any) => (r.rows ?? r) as any[]);
      const reqRow = reqLocked[0];
      if (!reqRow || reqRow.toStreamId !== id) return { code: 404, body: { error: "Request not found" } };
      if (reqRow.status !== "pending") return { code: 409, body: { error: "Request is not pending" } };
      // Lock both stream rows in id order
      const [a, b] = id < reqRow.fromStreamId ? [id, reqRow.fromStreamId] : [reqRow.fromStreamId, id];
      const lockRows: any = await tx.execute(sql`
        SELECT id, user_id AS "userId", status, battle_opponent_id AS "battleOpponentId"
        FROM livestreams WHERE id IN (${a}, ${b}) FOR UPDATE
      `).then((r: any) => (r.rows ?? r) as any[]);
      const me_stream = lockRows.find((s: any) => s.id === id);
      const opp = lockRows.find((s: any) => s.id === reqRow.fromStreamId);
      if (!me_stream || !opp) return { code: 404, body: { error: "Stream not found" } };
      if (me_stream.userId !== me) return { code: 403, body: { error: "Only the host can accept" } };
      if (me_stream.status !== "live" || opp.status !== "live") return { code: 400, body: { error: "Both streams must be live" } };
      if (me_stream.battleOpponentId || opp.battleOpponentId) return { code: 409, body: { error: "One of the streams is already in a battle" } };
      const endsAt = new Date(Date.now() + reqRow.durationSeconds * 1000);
      await tx.update(livestreamsTable).set({
        battleOpponentId: opp.id, battleScore: "0", battleOpponentScore: "0", battleEndsAt: endsAt,
      }).where(eq(livestreamsTable.id, id));
      await tx.update(livestreamsTable).set({
        battleOpponentId: id, battleScore: "0", battleOpponentScore: "0", battleEndsAt: endsAt,
      }).where(eq(livestreamsTable.id, opp.id));
      await tx.update(livestreamBattleRequestsTable).set({ status: "accepted" })
        .where(eq(livestreamBattleRequestsTable.id, requestId));
      // Cancel any other pending requests involving either stream so they can't be accepted later
      await tx.execute(sql`
        UPDATE livestream_battle_requests SET status = 'cancelled'
        WHERE status = 'pending'
          AND id <> ${requestId}
          AND (from_stream_id IN (${id}, ${opp.id}) OR to_stream_id IN (${id}, ${opp.id}))
      `);
      return { code: 200, body: { ok: true } };
    });
    res.status(result.code).json(result.body);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /livestreams/:id/battle/requests/:requestId/reject — reject incoming (pending only)
router.post("/livestreams/:id/battle/requests/:requestId/reject", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requestId = Number(req.params.requestId);
    const me = req.user!.appUserId;
    const [reqRow] = await db.select().from(livestreamBattleRequestsTable)
      .where(eq(livestreamBattleRequestsTable.id, requestId));
    if (!reqRow || reqRow.toStreamId !== id) return res.status(404).json({ error: "Request not found" });
    if (reqRow.status !== "pending") return res.status(409).json({ error: "Request is not pending" });
    const [me_stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!me_stream || me_stream.userId !== me) return res.status(403).json({ error: "Only the host can reject" });
    // Conditional update — only if still pending
    await db.update(livestreamBattleRequestsTable).set({ status: "rejected" })
      .where(and(
        eq(livestreamBattleRequestsTable.id, requestId),
        eq(livestreamBattleRequestsTable.status, "pending"),
      ));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /livestreams/:id/battle/requests/:requestId — sender cancels their outgoing request (pending only)
router.delete("/livestreams/:id/battle/requests/:requestId", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const requestId = Number(req.params.requestId);
    const me = req.user!.appUserId;
    const [reqRow] = await db.select().from(livestreamBattleRequestsTable)
      .where(eq(livestreamBattleRequestsTable.id, requestId));
    if (!reqRow || reqRow.fromStreamId !== id) return res.status(404).json({ error: "Request not found" });
    if (reqRow.status !== "pending") return res.status(409).json({ error: "Request is not pending" });
    const [me_stream] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, id));
    if (!me_stream || me_stream.userId !== me) return res.status(403).json({ error: "Only the host can cancel" });
    // Conditional update — only if still pending
    await db.update(livestreamBattleRequestsTable).set({ status: "cancelled" })
      .where(and(
        eq(livestreamBattleRequestsTable.id, requestId),
        eq(livestreamBattleRequestsTable.status, "pending"),
      ));
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
