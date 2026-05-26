import { Router } from "express";
import { db, giftTransactionsTable, platformBankTable, platformPayoutsTable } from "@workspace/db";
import { sql, eq, desc } from "drizzle-orm";
import { requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

router.use("/platform", requireAdmin);

router.get("/platform/earnings", async (_req, res) => {
  try {
    const [agg] = await db
      .select({
        totalGross: sql<number>`COALESCE(SUM(${giftTransactionsTable.amount}), 0)`,
        platformShare: sql<number>`COALESCE(SUM(${giftTransactionsTable.platformShare}), 0)`,
        streamerShare: sql<number>`COALESCE(SUM(${giftTransactionsTable.streamerShare}), 0)`,
      })
      .from(giftTransactionsTable);
    const [paidAgg] = await db
      .select({ paid: sql<number>`COALESCE(SUM(${platformPayoutsTable.amount}), 0)`, c: sql<number>`COUNT(*)` })
      .from(platformPayoutsTable)
      .where(eq(platformPayoutsTable.status, "paid"));

    const totalGross = Number(agg?.totalGross ?? 0);
    const platformShare = Number(agg?.platformShare ?? 0);
    const streamerShare = Number(agg?.streamerShare ?? 0);
    const paidOut = Number(paidAgg?.paid ?? 0);

    res.json({
      totalGross,
      platformShare,
      streamerShare,
      paidOut,
      pendingPayout: Math.max(0, platformShare - paidOut),
      payoutCount: Number(paidAgg?.c ?? 0),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.get("/platform/bank", async (_req, res) => {
  try {
    const [bank] = await db.select().from(platformBankTable).orderBy(desc(platformBankTable.id)).limit(1);
    if (!bank) return res.status(404).json({ error: "No platform bank linked" });
    res.json({ ...bank, createdAt: bank.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/platform/bank", async (req, res) => {
  try {
    const { bankName, accountNumber, routingNumber, accountHolderName } = req.body ?? {};
    if (!bankName || !accountNumber || !accountHolderName) {
      return res.status(400).json({ error: "bankName, accountNumber, accountHolderName required" });
    }
    const last4 = String(accountNumber).slice(-4);
    await db.delete(platformBankTable);
    const [bank] = await db.insert(platformBankTable).values({
      bankName, last4, routingNumber: routingNumber ?? null, accountHolderName, status: "verified",
    }).returning();
    res.status(201).json({ ...bank, createdAt: bank.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

router.post("/platform/payout", async (_req, res) => {
  try {
    const result = await db.transaction(async (tx) => {
      // Single-key advisory lock for platform-wide payout serialization.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(0)`);

      const [bank] = await tx.select().from(platformBankTable).orderBy(desc(platformBankTable.id)).limit(1);
      if (!bank) throw new Error("NO_BANK");

      const [agg] = await tx
        .select({ s: sql<number>`COALESCE(SUM(${giftTransactionsTable.platformShare}), 0)` })
        .from(giftTransactionsTable);
      const [paidAgg] = await tx
        .select({ p: sql<number>`COALESCE(SUM(${platformPayoutsTable.amount}), 0)` })
        .from(platformPayoutsTable)
        .where(eq(platformPayoutsTable.status, "paid"));
      const pending = Math.max(0, Number(agg?.s ?? 0) - Number(paidAgg?.p ?? 0));
      if (pending <= 0) throw new Error("NO_BALANCE");

      const [p] = await tx.insert(platformPayoutsTable).values({
        amount: String(pending.toFixed(2)), status: "paid", bankLast4: bank.last4,
      }).returning();
      return p;
    });
    res.status(201).json({ ...result, amount: Number(result.amount), createdAt: result.createdAt.toISOString() });
  } catch (e: any) {
    if (e?.message === "NO_BANK") return res.status(400).json({ error: "Link the platform bank account first." });
    if (e?.message === "NO_BALANCE") return res.status(400).json({ error: "No platform earnings to withdraw." });
    res.status(400).json({ error: String(e) });
  }
});

router.get("/platform/payout", async (_req, res) => {
  try {
    const rows = await db.select().from(platformPayoutsTable).orderBy(desc(platformPayoutsTable.createdAt));
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount), createdAt: r.createdAt.toISOString() })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
