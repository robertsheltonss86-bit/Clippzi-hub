import { Router } from "express";
import { db, usersTable, giftsTable, giftTransactionsTable, livestreamsTable, coinPurchasesTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

// 1 coin = 1 cent ($0.01). Coins map 1:1 to the existing "points" economy.
const CENTS_PER_COIN = 1;
const MIN_PURCHASE_COINS = 50; // $0.50 — Stripe's minimum charge
const MAX_PURCHASE_COINS = 250_000; // $2,500

function appOrigin(req: any): string {
  const proto = req.get("x-forwarded-proto") ?? "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

// GET /coins/balance — the signed-in user's current coin balance
router.get("/coins/balance", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.appUserId;
    if (!userId) return res.status(401).json({ error: "No app user linked" });
    const [user] = await db.select({ coinBalance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, userId));
    res.json({ balance: user?.coinBalance ?? 0 });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /coins/checkout — start a Stripe Checkout session to buy coins
router.post("/coins/checkout", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.appUserId;
    if (!userId) return res.status(401).json({ error: "No app user linked" });

    const coins = Math.floor(Number(req.body?.coins));
    if (!Number.isFinite(coins) || coins < MIN_PURCHASE_COINS || coins > MAX_PURCHASE_COINS) {
      return res.status(400).json({ error: `Choose between ${MIN_PURCHASE_COINS.toLocaleString()} and ${MAX_PURCHASE_COINS.toLocaleString()} coins.` });
    }

    const unitAmount = coins * CENTS_PER_COIN; // cents
    const stripe = await getUncachableStripeClient();
    const origin = appOrigin(req);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: `🪙 ${coins.toLocaleString()} Clippzi Coins`,
            description: `Top up your Clippzi wallet with ${coins.toLocaleString()} coins`,
          },
        },
      }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=coins`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        kind: "coins",
        userId: String(userId),
        coins: String(coins),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /coins/checkout/confirm — verify payment, credit the wallet (idempotent on session)
router.post("/coins/checkout/confirm", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.appUserId;
    if (!userId) return res.status(401).json({ error: "No app user linked" });
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const existing = (await db.select().from(coinPurchasesTable).where(eq(coinPurchasesTable.stripeSessionId, sessionId)))[0];
    if (existing) {
      if (existing.userId !== userId) return res.status(403).json({ error: "Not your purchase" });
      const [u] = await db.select({ coinBalance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, userId));
      return res.json({ alreadyRecorded: true, coins: existing.coins, balance: u?.coinBalance ?? 0 });
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment not completed: ${session.payment_status}` });
    }

    const m = session.metadata ?? {};
    if (m.kind !== "coins") return res.status(400).json({ error: "Not a coin purchase session" });
    const sessionUserId = Number(m.userId);
    const coins = Math.floor(Number(m.coins));
    if (sessionUserId !== userId) return res.status(403).json({ error: "Not your purchase" });
    if (!Number.isFinite(coins) || coins <= 0) return res.status(400).json({ error: "Invalid coin amount" });

    const amountUsd = (coins * CENTS_PER_COIN) / 100;

    // Insert the purchase ledger row and credit the wallet atomically: either
    // both commit or neither does, so a paid purchase can never be marked
    // completed without the coins landing in the wallet.
    const result = await db.transaction(async (tx) => {
      const inserted = await tx.insert(coinPurchasesTable).values({
        userId,
        coins,
        amountUsd: String(amountUsd.toFixed(2)),
        stripeSessionId: sessionId,
        status: "completed",
      }).onConflictDoNothing({ target: coinPurchasesTable.stripeSessionId }).returning();

      if (inserted.length === 0) {
        // Lost the race — another confirm already credited this session.
        const [u] = await tx.select({ coinBalance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, userId));
        return { alreadyRecorded: true as const, balance: u?.coinBalance ?? 0 };
      }

      const [updated] = await tx.update(usersTable)
        .set({ coinBalance: sql`${usersTable.coinBalance} + ${coins}` })
        .where(eq(usersTable.id, userId))
        .returning({ coinBalance: usersTable.coinBalance });

      return { alreadyRecorded: false as const, balance: updated?.coinBalance ?? coins };
    });

    if (result.alreadyRecorded) {
      return res.json({ alreadyRecorded: true, coins, balance: result.balance });
    }
    res.status(201).json({ coins, balance: result.balance });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /coins/gift — spend coins to send a gift (no Stripe; deducts from wallet)
router.post("/coins/gift", requireAuth, async (req, res) => {
  try {
    const senderId = req.user!.appUserId;
    if (!senderId) return res.status(401).json({ error: "No app user linked" });

    const { giftId, receiverId, streamId } = req.body ?? {};
    const qty = Math.max(1, Math.min(99, Number(req.body?.quantity ?? 1)));
    if (!giftId || !receiverId) return res.status(400).json({ error: "giftId and receiverId required" });
    if (Number(receiverId) === senderId) return res.status(400).json({ error: "Cannot send a gift to yourself" });

    const [gift] = await db.select().from(giftsTable).where(eq(giftsTable.id, Number(giftId)));
    if (!gift) return res.status(404).json({ error: "Gift not found" });
    const [receiver] = await db.select().from(usersTable).where(eq(usersTable.id, Number(receiverId)));
    if (!receiver) return res.status(404).json({ error: "Receiver not found" });

    const total = Number(gift.price) * qty; // dollars
    const coinCost = Math.round(Number(gift.price) * 100) * qty; // 1 coin = 1 cent
    const streamerShare = total * 0.7;
    const platformShare = total * 0.3;

    const sid = streamId ? Number(streamId) : null;

    // All-or-nothing: the conditional debit, the gift record, and the stream/
    // battle score updates commit together. If anything fails the debit rolls
    // back, so coins are never lost without a corresponding gift.
    const outcome = await db.transaction(async (tx) => {
      // Atomically deduct coins only if the sender can afford it.
      const [debited] = await tx.update(usersTable)
        .set({ coinBalance: sql`${usersTable.coinBalance} - ${coinCost}` })
        .where(and(eq(usersTable.id, senderId), sql`${usersTable.coinBalance} >= ${coinCost}`))
        .returning({ coinBalance: usersTable.coinBalance });

      if (!debited) {
        const [u] = await tx.select({ coinBalance: usersTable.coinBalance }).from(usersTable).where(eq(usersTable.id, senderId));
        return { insufficient: true as const, balance: u?.coinBalance ?? 0 };
      }

      const [gtx] = await tx.insert(giftTransactionsTable).values({
        giftId: Number(giftId),
        senderId,
        receiverId: Number(receiverId),
        streamId: sid,
        amount: String(total.toFixed(2)),
        streamerShare: String(streamerShare.toFixed(2)),
        platformShare: String(platformShare.toFixed(2)),
        quantity: qty,
        coinCost,
      }).returning();

      if (sid) {
        const [ls] = await tx.select().from(livestreamsTable).where(eq(livestreamsTable.id, sid));
        await tx.update(livestreamsTable)
          .set({ totalGiftsReceived: sql`${livestreamsTable.totalGiftsReceived} + ${total}` })
          .where(eq(livestreamsTable.id, sid));

        const battleLive =
          ls?.battleOpponentId != null &&
          ls?.battleEndsAt != null &&
          new Date(ls.battleEndsAt).getTime() > Date.now();
        if (battleLive) {
          await tx.update(livestreamsTable)
            .set({ battleScore: sql`${livestreamsTable.battleScore} + ${total}` })
            .where(eq(livestreamsTable.id, sid));
          await tx.update(livestreamsTable)
            .set({ battleOpponentScore: sql`${livestreamsTable.battleOpponentScore} + ${total}` })
            .where(eq(livestreamsTable.id, ls!.battleOpponentId!));
        }
      }

      return { insufficient: false as const, transactionId: gtx.id, balance: debited.coinBalance };
    });

    if (outcome.insufficient) {
      return res.status(402).json({ error: "Not enough coins", balance: outcome.balance, required: coinCost });
    }

    res.status(201).json({
      transactionId: outcome.transactionId,
      coinCost,
      balance: outcome.balance,
      amount: total,
      streamerShare,
      platformShare,
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

export default router;
