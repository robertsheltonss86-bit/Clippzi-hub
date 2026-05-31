import { Router } from "express";
import { db, giftsTable, giftTransactionsTable, livestreamsTable, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

function appOrigin(req: any): string {
  const proto = req.get("x-forwarded-proto") ?? "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

// POST /checkout/gift — creates a Stripe Checkout session so the sender pays real money
router.post("/checkout/gift", requireAuth, async (req, res) => {
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

    const stripe = await getUncachableStripeClient();
    const origin = appOrigin(req);
    const unitAmount = Math.round(Number(gift.price) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: qty,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: `${gift.emoji} ${gift.name} → @${receiver.username}`,
            description: gift.description ?? `Send a ${gift.name} gift`,
          },
        },
      }],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancel`,
      metadata: {
        giftId: String(giftId),
        senderId: String(senderId),
        receiverId: String(receiverId),
        streamId: streamId ? String(streamId) : "",
        quantity: String(qty),
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /checkout/gift/confirm — verify session paid and record the gift transaction (idempotent on session_id)
router.post("/checkout/gift/confirm", requireAuth, async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });

    const existing = (await db.select().from(giftTransactionsTable).where(eq(giftTransactionsTable.stripeSessionId, sessionId)))[0];
    if (existing) {
      if (existing.senderId !== req.user!.appUserId) {
        return res.status(403).json({ error: "Not the gift sender" });
      }
      return res.json({ alreadyRecorded: true, transactionId: existing.id });
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: `Payment not completed: ${session.payment_status}` });
    }

    const m = session.metadata ?? {};
    const giftId = Number(m.giftId);
    const senderId = Number(m.senderId);
    const receiverId = Number(m.receiverId);
    const streamId = m.streamId ? Number(m.streamId) : null;
    const quantity = Math.max(1, Number(m.quantity ?? 1));

    // Verify the caller is the sender (or just allow either — Stripe already proved payment).
    if (req.user!.appUserId !== senderId) {
      return res.status(403).json({ error: "Not the gift sender" });
    }

    const [gift] = await db.select().from(giftsTable).where(eq(giftsTable.id, giftId));
    if (!gift) return res.status(404).json({ error: "Gift no longer exists" });

    const total = Number(gift.price) * quantity;
    const streamerShare = total * 0.7;
    const platformShare = total * 0.3;

    const inserted = await db.insert(giftTransactionsTable).values({
      giftId,
      senderId,
      receiverId,
      streamId,
      amount: String(total.toFixed(2)),
      streamerShare: String(streamerShare.toFixed(2)),
      platformShare: String(platformShare.toFixed(2)),
      quantity,
      stripeSessionId: sessionId,
    }).onConflictDoNothing({ target: giftTransactionsTable.stripeSessionId }).returning();

    if (inserted.length === 0) {
      // Lost the race — another confirm already recorded this session.
      const [dup] = await db.select().from(giftTransactionsTable).where(eq(giftTransactionsTable.stripeSessionId, sessionId));
      if (dup && dup.senderId !== req.user!.appUserId) {
        return res.status(403).json({ error: "Not the gift sender" });
      }
      return res.json({ alreadyRecorded: true, transactionId: dup?.id });
    }

    const tx = inserted[0];

    if (streamId) {
      const [ls] = await db.select().from(livestreamsTable).where(eq(livestreamsTable.id, streamId));
      await db.update(livestreamsTable)
        .set({ totalGiftsReceived: sql`${livestreamsTable.totalGiftsReceived} + ${total}` })
        .where(eq(livestreamsTable.id, streamId));

      // If this stream is in an active battle, the gift value also counts toward
      // the battle score (stored in dollars, shown to users as points elsewhere).
      const battleLive =
        ls?.battleOpponentId != null &&
        ls?.battleEndsAt != null &&
        new Date(ls.battleEndsAt).getTime() > Date.now();
      if (battleLive) {
        await db.update(livestreamsTable)
          .set({ battleScore: sql`${livestreamsTable.battleScore} + ${total}` })
          .where(eq(livestreamsTable.id, streamId));
        await db.update(livestreamsTable)
          .set({ battleOpponentScore: sql`${livestreamsTable.battleOpponentScore} + ${total}` })
          .where(eq(livestreamsTable.id, ls!.battleOpponentId!));
      }
    }

    res.status(201).json({ transactionId: tx.id, amount: total, streamerShare, platformShare });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

export default router;
