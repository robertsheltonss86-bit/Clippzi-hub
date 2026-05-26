import { Router } from "express";
import { db } from "@workspace/db";
import { livestreamsTable, usersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
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
    user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
    createdAt: stream.createdAt.toISOString(),
    startedAt: stream.startedAt?.toISOString() ?? null,
    endedAt: stream.endedAt?.toISOString() ?? null,
  };
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
