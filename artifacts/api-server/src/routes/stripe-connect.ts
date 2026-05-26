import { Router } from "express";
import { db, usersTable, giftTransactionsTable, payoutsTable } from "@workspace/db";
import { eq, sql, and, desc, inArray } from "drizzle-orm";
import { getUncachableStripeClient } from "../lib/stripeClient";

const router = Router();

function appOrigin(req: any): string {
  const proto = req.get("x-forwarded-proto") ?? "https";
  const host = req.get("host");
  return `${proto}://${host}`;
}

// POST /users/:id/stripe/onboard — create or refresh Express account + onboarding link
router.post("/users/:id/stripe/onboard", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });

    const stripe = await getUncachableStripeClient();
    let accountId = user.stripeAccountId;

    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        capabilities: { transfers: { requested: true } },
        metadata: { clippziUserId: String(id), username: user.username },
        ...(user.email ? { email: user.email } : {}),
      });
      accountId = acct.id;
      await db.update(usersTable).set({ stripeAccountId: accountId }).where(eq(usersTable.id, id));
    }

    const origin = appOrigin(req);
    const returnUrl = `${origin}/profile/${id}/earnings?stripe=return`;
    const refreshUrl = `${origin}/profile/${id}/earnings?stripe=refresh`;
    const link = await stripe.accountLinks.create({
      account: accountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: "account_onboarding",
    });

    res.json({ url: link.url, accountId });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// GET /users/:id/stripe/status — onboarding/payout readiness
router.get("/users/:id/stripe/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.stripeAccountId) {
      return res.json({ connected: false, payoutsEnabled: false, detailsSubmitted: false });
    }
    const stripe = await getUncachableStripeClient();
    const acct = await stripe.accounts.retrieve(user.stripeAccountId);
    const payoutsEnabled = !!acct.payouts_enabled;

    if (payoutsEnabled !== user.stripePayoutsEnabled) {
      await db.update(usersTable).set({ stripePayoutsEnabled: payoutsEnabled }).where(eq(usersTable.id, id));
    }
    res.json({
      connected: true,
      accountId: user.stripeAccountId,
      payoutsEnabled,
      detailsSubmitted: !!acct.details_submitted,
      chargesEnabled: !!acct.charges_enabled,
      requirementsDue: acct.requirements?.currently_due ?? [],
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /users/:id/stripe/login-link — dashboard link for streamer
router.post("/users/:id/stripe/login-link", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user?.stripeAccountId) return res.status(400).json({ error: "No Stripe account connected" });
    const stripe = await getUncachableStripeClient();
    const link = await stripe.accounts.createLoginLink(user.stripeAccountId);
    res.json({ url: link.url });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// POST /users/:id/stripe/payout — transfer pending earnings to streamer's connected account
router.post("/users/:id/stripe/payout", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.stripeAccountId) return res.status(400).json({ error: "Complete Stripe onboarding first" });

    const stripe = await getUncachableStripeClient();
    const acct = await stripe.accounts.retrieve(user.stripeAccountId);
    if (!acct.payouts_enabled) return res.status(400).json({ error: "Stripe payouts not enabled yet — finish onboarding" });

    // Reserve the payout atomically: advisory lock + count BOTH paid and in-flight
    // reservations as deducted, so two concurrent requests can't both reserve.
    const { amountCents, payoutId } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);

      const [shareAgg] = await tx
        .select({ s: sql<number>`COALESCE(SUM(${giftTransactionsTable.streamerShare}), 0)` })
        .from(giftTransactionsTable)
        .where(eq(giftTransactionsTable.receiverId, id));
      const [reservedAgg] = await tx
        .select({ p: sql<number>`COALESCE(SUM(${payoutsTable.amount}), 0)` })
        .from(payoutsTable)
        .where(and(
          eq(payoutsTable.userId, id),
          inArray(payoutsTable.status, ["paid", "pending_stripe"]),
        ));

      const pending = Math.max(0, Number(shareAgg?.s ?? 0) - Number(reservedAgg?.p ?? 0));
      if (pending <= 0) throw new Error("NO_BALANCE");

      const [row] = await tx.insert(payoutsTable).values({
        userId: id,
        amount: String(pending.toFixed(2)),
        status: "pending_stripe",
        bankLast4: "stripe",
      }).returning();
      return { amountCents: Math.floor(pending * 100), payoutId: row.id };
    });

    try {
      // Idempotency key tied to our reservation row → Stripe dedupes safely on retry.
      const transfer = await stripe.transfers.create(
        {
          amount: amountCents,
          currency: "usd",
          destination: user.stripeAccountId,
          metadata: { clippziUserId: String(id), payoutId: String(payoutId) },
        },
        { idempotencyKey: `clippzi-payout-${payoutId}` },
      );
      await db.update(payoutsTable)
        .set({ status: "paid", bankLast4: transfer.id.slice(-4) })
        .where(eq(payoutsTable.id, payoutId));
      res.status(201).json({ id: payoutId, amount: amountCents / 100, status: "paid", transferId: transfer.id });
    } catch (transferErr: any) {
      // Mark as failed (don't delete — preserves audit trail; failed rows are excluded
      // from the reserved-balance calculation above).
      await db.update(payoutsTable)
        .set({ status: "failed" })
        .where(eq(payoutsTable.id, payoutId));
      throw new Error(`Stripe transfer failed: ${transferErr?.message ?? transferErr}`);
    }
  } catch (e: any) {
    if (e?.message === "NO_BALANCE") return res.status(400).json({ error: "No pending earnings to withdraw." });
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// GET /platform/stripe/balance — platform's Stripe balance (your 40% share)
router.get("/platform/stripe/balance", async (_req, res) => {
  try {
    const stripe = await getUncachableStripeClient();
    const bal = await stripe.balance.retrieve();
    const sum = (arr?: { amount: number; currency: string }[]) =>
      (arr ?? []).reduce((s, b) => s + (b.currency === "usd" ? b.amount : 0), 0) / 100;
    res.json({
      available: sum(bal.available),
      pending: sum(bal.pending),
      currency: "usd",
    });
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? String(e) });
  }
});

// GET /platform/stripe/dashboard — link to Stripe Dashboard
router.get("/platform/stripe/dashboard", async (_req, res) => {
  const isLive = process.env["REPLIT_DEPLOYMENT"] === "1";
  res.json({ url: isLive ? "https://dashboard.stripe.com/" : "https://dashboard.stripe.com/test" });
});

export default router;
