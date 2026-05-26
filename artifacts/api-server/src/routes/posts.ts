import { Router } from "express";
import { db } from "@workspace/db";
import { postsTable, usersTable, postLikesTable, commentsTable } from "@workspace/db";
import { eq, sql, desc, and, ilike } from "drizzle-orm";
import {
  ListPostsQueryParams,
  CreatePostBody,
  GetTrendingPostsQueryParams,
  GetPostParams,
  DeletePostParams,
  LikePostParams,
  LikePostBody,
  GetFeedQueryParams,
  GetFollowingFeedQueryParams,
  ListCommentsQueryParams,
  CreateCommentBody,
  DeleteCommentParams,
} from "@workspace/api-zod";
import { followsTable } from "@workspace/db";

const router = Router();

async function enrichPost(post: typeof postsTable.$inferSelect) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, post.userId));
  return {
    ...post,
    user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
    tags: post.tags ?? [],
    createdAt: post.createdAt.toISOString(),
  };
}

async function enrichPosts(posts: (typeof postsTable.$inferSelect)[]) {
  return Promise.all(posts.map(enrichPost));
}

// GET /posts
router.get("/posts", async (req, res) => {
  try {
    const query = ListPostsQueryParams.parse(req.query);
    let q = db.select().from(postsTable).$dynamic();
    if (query.userId) q = q.where(eq(postsTable.userId, query.userId));
    if (query.type && query.type !== "all") q = q.where(eq(postsTable.type, query.type as "video" | "image"));
    const posts = await q.orderBy(desc(postsTable.createdAt)).limit(query.limit ?? 20).offset(query.offset ?? 0);
    res.json(await enrichPosts(posts));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /posts
router.post("/posts", async (req, res) => {
  try {
    const body = CreatePostBody.parse(req.body);
    const [post] = await db.insert(postsTable).values({
      userId: body.userId,
      type: body.type as "video" | "image",
      title: body.title ?? null,
      description: body.description ?? null,
      mediaUrl: body.mediaUrl,
      thumbnailUrl: body.thumbnailUrl ?? null,
      musicTitle: body.musicTitle ?? null,
      musicArtist: body.musicArtist ?? null,
      musicUrl: body.musicUrl ?? null,
      duration: body.duration ?? null,
      tags: body.tags ?? [],
      moderationStatus: "approved",
    }).returning();
    await db.update(usersTable).set({ postCount: sql`${usersTable.postCount} + 1` }).where(eq(usersTable.id, body.userId));
    res.status(201).json(await enrichPost(post));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /posts/trending
router.get("/posts/trending", async (req, res) => {
  try {
    const query = GetTrendingPostsQueryParams.parse(req.query);
    const posts = await db.select().from(postsTable)
      .orderBy(desc(postsTable.viewCount))
      .limit(query.limit ?? 20);
    res.json(await enrichPosts(posts));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /posts/:id
router.get("/posts/:id", async (req, res) => {
  try {
    const { id } = GetPostParams.parse({ id: Number(req.params.id) });
    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, id));
    if (!post) return res.status(404).json({ error: "Post not found" });
    await db.update(postsTable).set({ viewCount: sql`${postsTable.viewCount} + 1` }).where(eq(postsTable.id, id));
    res.json(await enrichPost(post));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /posts/:id
router.delete("/posts/:id", async (req, res) => {
  try {
    const { id } = DeletePostParams.parse({ id: Number(req.params.id) });
    await db.delete(postsTable).where(eq(postsTable.id, id));
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /posts/:id/like
router.post("/posts/:id/like", async (req, res) => {
  try {
    const { id } = LikePostParams.parse({ id: Number(req.params.id) });
    const body = LikePostBody.parse(req.body);
    if (body.liked) {
      await db.insert(postLikesTable).values({ postId: id, userId: body.userId }).onConflictDoNothing();
      await db.update(postsTable).set({ likeCount: sql`${postsTable.likeCount} + 1` }).where(eq(postsTable.id, id));
    } else {
      await db.delete(postLikesTable).where(and(eq(postLikesTable.postId, id), eq(postLikesTable.userId, body.userId)));
      await db.update(postsTable).set({ likeCount: sql`GREATEST(${postsTable.likeCount} - 1, 0)` }).where(eq(postsTable.id, id));
    }
    const [post] = await db.select({ likeCount: postsTable.likeCount }).from(postsTable).where(eq(postsTable.id, id));
    res.json({ liked: body.liked, likeCount: post?.likeCount ?? 0 });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /feed
router.get("/feed", async (req, res) => {
  try {
    const query = GetFeedQueryParams.parse(req.query);
    const posts = await db.select().from(postsTable)
      .orderBy(desc(postsTable.createdAt))
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);
    res.json(await enrichPosts(posts));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /feed/following
router.get("/feed/following", async (req, res) => {
  try {
    const query = GetFollowingFeedQueryParams.parse(req.query);
    const followed = await db.select({ followingId: followsTable.followingId })
      .from(followsTable)
      .where(eq(followsTable.followerId, query.userId));
    const ids = followed.map((f) => f.followingId);
    if (ids.length === 0) return res.json([]);
    const posts = await db.select().from(postsTable)
      .where(sql`${postsTable.userId} = ANY(${sql`ARRAY[${sql.join(ids.map(id => sql`${id}`), sql`, `)}]::int[]`})`)
      .orderBy(desc(postsTable.createdAt))
      .limit(query.limit ?? 20)
      .offset(query.offset ?? 0);
    res.json(await enrichPosts(posts));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /feed/stats
router.get("/feed/stats", async (req, res) => {
  try {
    const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(usersTable);
    const [postCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(postsTable);
    const topStreamers = await db.select().from(usersTable)
      .orderBy(desc(usersTable.followerCount)).limit(5);

    res.json({
      totalUsers: Number(userCount?.count ?? 0),
      totalPosts: Number(postCount?.count ?? 0),
      activeLivestreams: 2,
      totalGiftsSent: 847,
      totalShopProducts: 143,
      topStreamers: topStreamers.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })),
      trendingTags: ["#clippzi", "#viral", "#live", "#fyp", "#trending"],
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /comments
router.get("/comments", async (req, res) => {
  try {
    const query = ListCommentsQueryParams.parse(req.query);
    const comments = await db.select().from(commentsTable)
      .where(eq(commentsTable.postId, query.postId))
      .orderBy(desc(commentsTable.createdAt))
      .limit(query.limit ?? 50);
    const enriched = await Promise.all(comments.map(async (c) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.userId));
      return { ...c, user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null, createdAt: c.createdAt.toISOString() };
    }));
    res.json(enriched);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /comments
router.post("/comments", async (req, res) => {
  try {
    const body = CreateCommentBody.parse(req.body);
    const postId = Number(req.query.postId ?? body.userId); // postId from body
    // postId must come from body since we moved it there
    const actualPostId = (req.body as { postId?: number }).postId ?? 0;
    const [comment] = await db.insert(commentsTable).values({
      postId: actualPostId || body.userId,
      userId: body.userId,
      text: body.text,
    }).returning();
    await db.update(postsTable).set({ commentCount: sql`${postsTable.commentCount} + 1` }).where(eq(postsTable.id, comment.postId));
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, comment.userId));
    res.status(201).json({ ...comment, user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null, createdAt: comment.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /comments/:id
router.delete("/comments/:id", async (req, res) => {
  try {
    const { id } = DeleteCommentParams.parse({ id: Number(req.params.id) });
    await db.delete(commentsTable).where(eq(commentsTable.id, id));
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
