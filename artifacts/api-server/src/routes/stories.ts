import { Router } from "express";
import { db } from "@workspace/db";
import { storiesTable, storyViewsTable, usersTable } from "@workspace/db";
import { eq, and, gt, inArray, asc, desc, sql } from "drizzle-orm";
import { CreateStoryBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function userPublic(u: typeof usersTable.$inferSelect | undefined) {
  return u ? { ...u, createdAt: u.createdAt.toISOString() } : null;
}

function storyPublic(s: typeof storiesTable.$inferSelect, viewed: boolean) {
  return {
    ...s,
    viewed,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  };
}

// GET /stories — active stories grouped by user. Unseen groups first, then by
// most recent activity. Includes a `hasUnseen` flag and per-story `viewed` for
// the signed-in user (false for anonymous viewers).
router.get("/stories", async (req, res) => {
  try {
    const me = req.user?.appUserId;
    const now = new Date();
    const rows = await db.select().from(storiesTable)
      .where(gt(storiesTable.expiresAt, now))
      .orderBy(asc(storiesTable.createdAt));

    if (rows.length === 0) return res.json([]);

    // Which of these stories has the current user already seen?
    let seen = new Set<number>();
    if (me) {
      const ids = rows.map((r) => r.id);
      const views = await db.select({ storyId: storyViewsTable.storyId })
        .from(storyViewsTable)
        .where(and(eq(storyViewsTable.viewerId, me), inArray(storyViewsTable.storyId, ids)));
      seen = new Set(views.map((v) => v.storyId));
    }

    // Group by user, preserving chronological order within each group.
    const byUser = new Map<number, typeof rows>();
    for (const r of rows) {
      const arr = byUser.get(r.userId) ?? [];
      arr.push(r);
      byUser.set(r.userId, arr);
    }

    const userIds = [...byUser.keys()];
    const users = await db.select().from(usersTable).where(inArray(usersTable.id, userIds));
    const userMap = new Map(users.map((u) => [u.id, u]));

    const groups = userIds.map((uid) => {
      const stories = byUser.get(uid)!;
      const hasUnseen = stories.some((s) => !seen.has(s.id));
      const lastAt = stories[stories.length - 1].createdAt.getTime();
      return {
        user: userPublic(userMap.get(uid)),
        stories: stories.map((s) => storyPublic(s, seen.has(s.id))),
        hasUnseen,
        _lastAt: lastAt,
      };
    }).filter((g) => g.user);

    // Unseen first, then most recent activity.
    groups.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b._lastAt - a._lastAt;
    });

    res.json(groups.map(({ _lastAt, ...g }) => g));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /stories/user/:userId — one user's active stories (oldest first).
router.get("/stories/user/:userId", async (req, res) => {
  try {
    const me = req.user?.appUserId;
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid user id" });
    const now = new Date();
    const rows = await db.select().from(storiesTable)
      .where(and(eq(storiesTable.userId, userId), gt(storiesTable.expiresAt, now)))
      .orderBy(asc(storiesTable.createdAt));

    let seen = new Set<number>();
    if (me && rows.length) {
      const views = await db.select({ storyId: storyViewsTable.storyId })
        .from(storyViewsTable)
        .where(and(eq(storyViewsTable.viewerId, me), inArray(storyViewsTable.storyId, rows.map((r) => r.id))));
      seen = new Set(views.map((v) => v.storyId));
    }
    res.json(rows.map((s) => storyPublic(s, seen.has(s.id))));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /stories — post a new story (expires 24h from now).
router.post("/stories", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const body = CreateStoryBody.parse(req.body);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [created] = await db.insert(storiesTable)
      .values({ userId: me, type: body.type, mediaUrl: body.mediaUrl, thumbnailUrl: body.thumbnailUrl ?? null, expiresAt })
      .returning();
    res.status(201).json(storyPublic(created, false));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /stories/:id/view — mark a story as seen by the signed-in user.
router.post("/stories/:id/view", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const storyId = Number(req.params.id);
    if (!storyId) return res.status(400).json({ error: "Invalid story id" });
    await db.insert(storyViewsTable)
      .values({ storyId, viewerId: me })
      .onConflictDoNothing();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
