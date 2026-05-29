import { Router } from "express";
import { db, giftsTable, giftTransactionsTable, livestreamsTable, usersTable, coinLedgerTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

// 1 coin = $0.01 USD. Gift priced $X => X * 100 coins.
export const COIN_USD = 0.01;

export type CoinPack = { id: string; coins: number; priceUsd: number; bonus?: number; popular?: boolean };

// Coin packs (bonus coins on bigger packs, TikTok-style value ladder).
export const COIN_PACKS: CoinPack[] = [
  { id: "pack_70", coins: 70, priceUsd: 0.99 },
  { id: "pack_350", coins: 350, priceUsd: 4.99 },
  { id: "pack_700", coins: 700, priceUsd: 9.99 },
  { id: "pack_1500", coins: 1500, priceUsd: 19.99, bonus: 100, popular: true },
  { id: "pack_4000", coins: 4000, priceUsd: 49.99, bonus: 400 },
  { id: "pack_8500", coins: 8500, priceUsd: 99.99, bonus: 1200 },
];

function appOrigin(req: any): string {
  const proto = req.get("x-forwarded-proto") ?? "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

function packTotalCoins(p: CoinPack): number {
  return p.coins + (p.bonus ?? 0);
}

// GET /coins/packs — list purchasable coin packs
router.get("/coins/packs", (_req, res) => {
  res.json({ packs: COIN_PACKS, coinUsd: COIN_USD });
});

// GET /coins/balance — current user's coin balance
router.get("/coins/balance", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "No app user linked" });
    const [u] = await db.select({ balance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, me));
    res.json({ balance: u?.balance ?? 0 });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /checkout/coins — create a Stripe Checkout session to buy a coin pack
router.post("/checkout/coins", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "No app user linked" });
    const packId = String(req.body?.packId ?? "");
    const pack = COIN_PACKS.find((p) => p.id === packId);
    if (!pack) return res.status(400).json({ error: "Unknown coin pack" });

    const stripe = await getUncachableStripeClient();
    const origin = appOrigin(req);
    const total = packTotalCoins(pack);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(pack.priceUsd * 100),
          product_data: {
            name: `${total.toLocaleString()} Clippzi Coins`,
            description: pack.bonus ? `${pack.coins.toLocaleString()} + ${pack.bonus.toLocaleString()} bonus coins` : `${pack.coins.toLocaleString()} coins`,
          },
        },
      }],
      success_url: `${origin}/checkout/success?type=coins&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        kind: "coins",
        userId: String(me),
        packId: pack.id,
        coins: String(total),
        priceUsd: String(pack.priceUsd),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /checkout/coins/confirm — verify paid + credit coins (idempotent on session id)
router.post("/checkout/coins/confirm", requireAuth, async (req, res) => {
  try {
    const me = req.user!.appUserId;
    if (!me) return res.status(401).json({ error: "No app user linked" });
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const existing = (await db.select().from(coinLedgerTable).where(eq(coinLedgerTable.stripeSessionId, sessionId)))[0];
    if (existing) {
      if (existing.userId !== me) return res.status(403).json({ error: "Not the buyer" });
      const [u] = await db.select({ balance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, me));
      return res.json({ alreadyRecorded: true, coinsAdded: existing.coins, balance: u?.balance ?? 0 });
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment not completed: ${session.payment_status}` });
    }
    const m = session.metadata ?? {};
    if (m.kind !== "coins") return res.status(400).json({ error: "Not a coin purchase" });
    const userId = Number(m.userId);
    const coins = Number(m.coins);
    const priceUsd = Number(m.priceUsd);
    if (userId !== me) return res.status(403).json({ error: "Not the buyer" });

    const result = await db.transaction(async (tx) => {
      // Claim this session by inserting the ledger row first. The unique
      // stripe_session_id makes concurrent confirms race-safe: only one insert
      // wins; the loser inserts zero rows and is treated as already-recorded.
      const inserted = await tx.insert(coinLedgerTable).values({
        userId,
        type: "purchase",
        coins,
        usd: String(priceUsd.toFixed(2)),
        balanceAfter: 0,
        stripeSessionId: sessionId,
        refId: String(m.packId ?? ""),
      }).onConflictDoNothing({ target: coinLedgerTable.stripeSessionId }).returning({ id: coinLedgerTable.id });

      if (inserted.length === 0) {
        const [u] = await tx.select({ balance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, userId));
        return { coinsAdded: coins, balance: u?.balance ?? 0, already: true };
      }

      const [updated] = await tx.update(usersTable)
        .set({ coinBalance: sql`${usersTable.coinBalance} + ${coins}` })
        .where(eq(usersTable.id, userId))
        .returning({ balance: usersTable.coinBalance });
      await tx.update(coinLedgerTable)
        .set({ balanceAfter: updated.balance })
        .where(eq(coinLedgerTable.id, inserted[0].id));
      return { coinsAdded: coins, balance: updated.balance, already: false };
    });

    res.status(result.already ? 200 : 201).json({ coinsAdded: result.coinsAdded, balance: result.balance });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /gifts/send-with-coins — spend coins to send a gift instantly (no redirect)
router.post("/gifts/send-with-coins", requireAuth, async (req, res) => {
  try {
    const senderId = req.user!.appUserId;
    if (!senderId) return res.status(401).json({ error: "No app user linked" });

    const { giftId, receiverId, streamId, quantity } = req.body ?? {};
    const qty = Math.max(1, Math.min(99, Number(quantity ?? 1)));
    if (!giftId || !receiverId) return res.status(400).json({ error: "giftId and receiverId required" });
    if (Number(receiverId) === senderId) return res.status(400).json({ error: "Cannot send a gift to yourself" });

    const [gift] = await db.select().from(giftsTable).where(eq(giftsTable.id, Number(giftId)));
    if (!gift) return res.status(404).json({ error: "Gift not found" });
    const [receiver] = await db.select().from(usersTable).where(eq(usersTable.id, Number(receiverId)));
    if (!receiver) return res.status(404).json({ error: "Receiver not found" });

    const total = Number(gift.price) * qty;
    const coinCost = Math.round(Number(gift.price) / COIN_USD) * qty; // gift.price dollars -> coins, per unit
    const streamerShare = total * 0.6;
    const platformShare = total * 0.4;
    const sid = streamId ? Number(streamId) : null;

    const result = await db.transaction(async (tx) => {
      // Lock the sender row & verify balance.
      const lockRows = await tx.execute(sql`SELECT coin_balance AS balance FROM users WHERE id = ${senderId} FOR UPDATE`)
        .then((r: any) => (r.rows ?? r) as any[]);
      const balance = Number(lockRows[0]?.balance ?? 0);
      if (balance < coinCost) {
        return { code: 402, body: { error: "Not enough coins", balance, coinCost } };
      }
      const [updated] = await tx.update(usersTable)
        .set({ coinBalance: sql`${usersTable.coinBalance} - ${coinCost}` })
        .where(eq(usersTable.id, senderId))
        .returning({ balance: usersTable.coinBalance });

      const [txRow] = await tx.insert(giftTransactionsTable).values({
        giftId: Number(giftId),
        senderId,
        receiverId: Number(receiverId),
        streamId: sid,
        amount: String(total.toFixed(2)),
        streamerShare: String(streamerShare.toFixed(2)),
        platformShare: String(platformShare.toFixed(2)),
        quantity: qty,
      }).returning();

      await tx.insert(coinLedgerTable).values({
        userId: senderId,
        type: "spend",
        coins: -coinCost,
        usd: String(total.toFixed(2)),
        balanceAfter: updated.balance,
        refId: String(txRow.id),
      });

      if (sid) {
        await tx.update(livestreamsTable)
          .set({ totalGiftsReceived: sql`${livestreamsTable.totalGiftsReceived} + ${total}` })
          .where(eq(livestreamsTable.id, sid));
      }

      return { code: 201, body: { transactionId: txRow.id, coinCost, balance: updated.balance, amount: total } };
    });

    res.status(result.code).json(result.body);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

export default router;
