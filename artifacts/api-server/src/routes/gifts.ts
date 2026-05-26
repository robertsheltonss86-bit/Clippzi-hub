import { Router } from "express";
import { db } from "@workspace/db";
import { giftsTable, giftTransactionsTable, usersTable, livestreamsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import {
  ListGiftsQueryParams,
  GetGiftParams,
  SendGiftBody,
  ListGiftTransactionsQueryParams,
  GetGiftLeaderboardQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// GET /gifts
router.get("/gifts", async (req, res) => {
  try {
    const query = ListGiftsQueryParams.parse(req.query);
    let q = db.select().from(giftsTable).where(eq(giftsTable.isActive, true)).$dynamic();
    if (query.category) q = q.where(eq(giftsTable.category, query.category));
    const gifts = await q.orderBy(giftsTable.price);
    const formatted = gifts.map((g) => ({ ...g, price: Number(g.price) }));
    res.json(formatted);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /gifts/:id
router.get("/gifts/:id", async (req, res) => {
  try {
    const { id } = GetGiftParams.parse({ id: Number(req.params.id) });
    const [gift] = await db.select().from(giftsTable).where(eq(giftsTable.id, id));
    if (!gift) return res.status(404).json({ error: "Gift not found" });
    res.json({ ...gift, price: Number(gift.price) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /gifts/send — ADMIN-ONLY direct ledger write (test/backfill).
// Real gift purchases go through POST /checkout/gift which charges the sender via Stripe.
router.post("/gifts/send", requireAdmin, async (req, res) => {
  try {
    const body = SendGiftBody.parse(req.body);
    const [gift] = await db.select().from(giftsTable).where(eq(giftsTable.id, body.giftId));
    if (!gift) return res.status(404).json({ error: "Gift not found" });

    const giftPrice = Number(gift.price);
    const quantity = body.quantity ?? 1;
    const totalAmount = giftPrice * quantity;
    const streamerShare = totalAmount * 0.6;
    const platformShare = totalAmount * 0.4;

    const [tx] = await db.insert(giftTransactionsTable).values({
      giftId: body.giftId,
      senderId: body.senderId,
      receiverId: body.receiverId,
      streamId: body.streamId ?? null,
      amount: String(totalAmount),
      streamerShare: String(streamerShare),
      platformShare: String(platformShare),
      quantity,
      message: body.message ?? null,
    }).returning();

    if (body.streamId) {
      await db.update(livestreamsTable)
        .set({ totalGiftsReceived: sql`${livestreamsTable.totalGiftsReceived} + ${totalAmount}` })
        .where(eq(livestreamsTable.id, body.streamId));
    }

    const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, body.senderId));
    const [receiver] = await db.select().from(usersTable).where(eq(usersTable.id, body.receiverId));

    res.status(201).json({
      ...tx,
      gift: { ...gift, price: giftPrice },
      sender: sender ? { ...sender, createdAt: sender.createdAt.toISOString() } : null,
      receiver: receiver ? { ...receiver, createdAt: receiver.createdAt.toISOString() } : null,
      amount: totalAmount,
      streamerShare,
      platformShare,
      createdAt: tx.createdAt.toISOString(),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /gifts/transactions
router.get("/gifts/transactions", async (req, res) => {
  try {
    const query = ListGiftTransactionsQueryParams.parse(req.query);
    let q = db.select().from(giftTransactionsTable).$dynamic();
    if (query.userId) q = q.where(eq(giftTransactionsTable.receiverId, query.userId));
    if (query.streamId) q = q.where(eq(giftTransactionsTable.streamId, query.streamId));
    const txs = await q.orderBy(desc(giftTransactionsTable.createdAt)).limit(query.limit ?? 50);
    res.json(txs.map((t) => ({
      ...t,
      amount: Number(t.amount),
      streamerShare: Number(t.streamerShare),
      platformShare: Number(t.platformShare),
      createdAt: t.createdAt.toISOString(),
    })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /gifts/leaderboard
router.get("/gifts/leaderboard", async (req, res) => {
  try {
    const query = GetGiftLeaderboardQueryParams.parse(req.query);
    let q = db
      .select({
        userId: giftTransactionsTable.senderId,
        totalAmount: sql<number>`SUM(${giftTransactionsTable.amount})`,
        giftCount: sql<number>`COUNT(*)`,
      })
      .from(giftTransactionsTable)
      .$dynamic();
    if (query.streamId) q = q.where(eq(giftTransactionsTable.streamId, query.streamId));
    const rows = await q
      .groupBy(giftTransactionsTable.senderId)
      .orderBy(desc(sql`SUM(${giftTransactionsTable.amount})`))
      .limit(query.limit ?? 10);

    const ranked = await Promise.all(rows.map(async (row, i) => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, row.userId));
      return {
        rank: i + 1,
        user: user ? { ...user, createdAt: user.createdAt.toISOString() } : null,
        totalAmount: Number(row.totalAmount),
        giftCount: Number(row.giftCount),
      };
    }));
    res.json(ranked);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
