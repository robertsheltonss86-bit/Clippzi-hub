import { Router } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, usersTable } from "@workspace/db";
import { eq, and, or, sql, desc } from "drizzle-orm";
import { ListMessagesQueryParams, SendMessageBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function userPublic(u: typeof usersTable.$inferSelect | undefined) {
  return u ? { ...u, createdAt: u.createdAt.toISOString() } : null;
}

// Conversation rows store the smaller user id in user1Id for a stable pair key.
function pairKey(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function findOrCreateConversation(a: number, b: number) {
  const [u1, u2] = pairKey(a, b);
  const [existing] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.user1Id, u1), eq(conversationsTable.user2Id, u2)));
  if (existing) return existing;
  // onConflictDoNothing makes this race-safe: if another concurrent request
  // already created the row, the insert returns nothing and we re-select it.
  const [created] = await db.insert(conversationsTable)
    .values({ user1Id: u1, user2Id: u2 })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.user1Id, u1), eq(conversationsTable.user2Id, u2)));
  return row;
}

// GET /conversations — list the signed-in user's conversations, newest activity first.
router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const rows = await db.select().from(conversationsTable)
      .where(or(eq(conversationsTable.user1Id, me), eq(conversationsTable.user2Id, me)))
      .orderBy(desc(sql`COALESCE(${conversationsTable.lastMessageAt}, ${conversationsTable.createdAt})`));

    const enriched = await Promise.all(rows.map(async (c) => {
      const otherId = c.user1Id === me ? c.user2Id : c.user1Id;
      const [other] = await db.select().from(usersTable).where(eq(usersTable.id, otherId));
      const [unread] = await db.select({ count: sql<number>`COUNT(*)` }).from(messagesTable)
        .where(and(
          eq(messagesTable.conversationId, c.id),
          eq(messagesTable.recipientId, me),
          eq(messagesTable.isRead, false),
        ));
      return {
        id: c.id,
        otherUser: userPublic(other),
        lastMessageText: c.lastMessageText,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
        unreadCount: Number(unread?.count ?? 0),
        createdAt: c.createdAt.toISOString(),
      };
    }));
    res.json(enriched.filter((c) => c.otherUser));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /messages?otherUserId= — messages between me and otherUserId (oldest first).
// Also marks messages addressed to me from that user as read.
router.get("/messages", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const query = ListMessagesQueryParams.parse(req.query);
    const other = query.otherUserId;
    const [u1, u2] = pairKey(me, other);

    const [conv] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.user1Id, u1), eq(conversationsTable.user2Id, u2)));
    if (!conv) return res.json([]);

    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.recipientId, me),
        eq(messagesTable.isRead, false),
      ));

    // Fetch the most recent N messages, then reverse so the client receives
    // them oldest-first (chronological) while still showing the latest chat.
    const rows = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(query.limit ?? 100);

    res.json(rows.reverse().map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /messages — send a DM to another user. Sender derived from the session.
router.post("/messages", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "Unauthorized" });
    const body = SendMessageBody.parse(req.body);
    const recipientId = body.recipientId;
    const text = body.text.trim();
    if (!text) return res.status(400).json({ error: "Message cannot be empty" });
    if (recipientId === me) return res.status(400).json({ error: "You can't message yourself" });

    const [recipient] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, recipientId));
    if (!recipient) return res.status(404).json({ error: "User not found" });

    const conv = await findOrCreateConversation(me, recipientId);
    const [message] = await db.insert(messagesTable).values({
      conversationId: conv.id,
      senderId: me,
      recipientId,
      text,
    }).returning();

    await db.update(conversationsTable)
      .set({ lastMessageText: text, lastMessageAt: message.createdAt })
      .where(eq(conversationsTable.id, conv.id));

    res.status(201).json({ ...message, createdAt: message.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
