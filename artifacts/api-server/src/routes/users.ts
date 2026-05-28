import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, followsTable, bankAccountsTable, giftTransactionsTable, payoutsTable } from "@workspace/db";
import { eq, ilike, sql, and, desc } from "drizzle-orm";
import {
  ListUsersQueryParams,
  CreateUserBody,
  GetUserParams,
  UpdateUserParams,
  UpdateUserBody,
  FollowUserParams,
  FollowUserBody,
  GetUserFollowersParams,
  GetUserFollowingParams,
  GetUserStatsParams,
  GetUserEarningsParams,
  GetUserBankAccountParams,
  LinkBankAccountParams,
  LinkBankAccountBody,
} from "@workspace/api-zod";

const router = Router();

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    ...u,
    createdAt: u.createdAt.toISOString(),
    role: u.role ?? "user",
    suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
  };
}

// GET /users
router.get("/users", async (req, res) => {
  try {
    const query = ListUsersQueryParams.parse(req.query);
    let q = db.select().from(usersTable).$dynamic();
    if (query.q) {
      q = q.where(ilike(usersTable.username, `%${query.q}%`));
    }
    const users = await q.limit(query.limit ?? 20).offset(query.offset ?? 0);
    res.json(users.map(formatUser));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /users
router.post("/users", async (req, res) => {
  try {
    const body = CreateUserBody.parse(req.body);
    const [user] = await db.insert(usersTable).values({
      username: body.username,
      displayName: body.displayName,
      email: body.email,
      bio: body.bio ?? null,
      avatarUrl: body.avatarUrl ?? null,
    }).returning();
    res.status(201).json(formatUser(user));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id
router.get("/users/:id", async (req, res) => {
  try {
    const { id } = GetUserParams.parse({ id: Number(req.params.id) });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(formatUser(user));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /users/:id
router.patch("/users/:id", async (req, res) => {
  try {
    const { id } = UpdateUserParams.parse({ id: Number(req.params.id) });
    const body = UpdateUserBody.parse(req.body);
    const { role, ...rest } = body;
    const [user] = await db.update(usersTable).set({
      ...rest,
      ...(role ? { role: role as "user" | "streamer" | "admin" } : {}),
    }).where(eq(usersTable.id, id)).returning();
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(formatUser(user));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /users/:id/follow
router.post("/users/:id/follow", async (req, res) => {
  try {
    const { id } = FollowUserParams.parse({ id: Number(req.params.id) });
    const body = FollowUserBody.parse(req.body);
    const { followerId, action } = body;

    if (action === "follow") {
      await db.insert(followsTable).values({ followerId, followingId: id }).onConflictDoNothing();
      await db.update(usersTable).set({ followerCount: sql`${usersTable.followerCount} + 1` }).where(eq(usersTable.id, id));
      await db.update(usersTable).set({ followingCount: sql`${usersTable.followingCount} + 1` }).where(eq(usersTable.id, followerId));
    } else {
      await db.delete(followsTable).where(and(eq(followsTable.followerId, followerId), eq(followsTable.followingId, id)));
      await db.update(usersTable).set({ followerCount: sql`GREATEST(${usersTable.followerCount} - 1, 0)` }).where(eq(usersTable.id, id));
      await db.update(usersTable).set({ followingCount: sql`GREATEST(${usersTable.followingCount} - 1, 0)` }).where(eq(usersTable.id, followerId));
    }

    const [updated] = await db.select({ followerCount: usersTable.followerCount }).from(usersTable).where(eq(usersTable.id, id));
    res.json({ following: action === "follow", followerCount: updated?.followerCount ?? 0 });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/followers
router.get("/users/:id/followers", async (req, res) => {
  try {
    const { id } = GetUserFollowersParams.parse({ id: Number(req.params.id) });
    const followers = await db
      .select({ user: usersTable })
      .from(followsTable)
      .innerJoin(usersTable, eq(usersTable.id, followsTable.followerId))
      .where(eq(followsTable.followingId, id));
    res.json(followers.map((f) => formatUser(f.user)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/following
router.get("/users/:id/following", async (req, res) => {
  try {
    const { id } = GetUserFollowingParams.parse({ id: Number(req.params.id) });
    const following = await db
      .select({ user: usersTable })
      .from(followsTable)
      .innerJoin(usersTable, eq(usersTable.id, followsTable.followingId))
      .where(eq(followsTable.followerId, id));
    res.json(following.map((f) => formatUser(f.user)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/stats
router.get("/users/:id/stats", async (req, res) => {
  try {
    const { id } = GetUserStatsParams.parse({ id: Number(req.params.id) });
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) return res.status(404).json({ error: "User not found" });

    const giftsReceived = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftTransactionsTable.amount}), 0)` })
      .from(giftTransactionsTable)
      .where(eq(giftTransactionsTable.receiverId, id));

    const giftsSent = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftTransactionsTable.amount}), 0)` })
      .from(giftTransactionsTable)
      .where(eq(giftTransactionsTable.senderId, id));

    const earnings = await db
      .select({ total: sql<number>`COALESCE(SUM(${giftTransactionsTable.streamerShare}), 0)` })
      .from(giftTransactionsTable)
      .where(eq(giftTransactionsTable.receiverId, id));

    res.json({
      userId: id,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      postCount: user.postCount,
      totalViews: user.totalViews,
      totalGiftsReceived: Number(giftsReceived[0]?.total ?? 0),
      totalEarnings: Number(earnings[0]?.total ?? 0),
      totalGiftsSent: Number(giftsSent[0]?.total ?? 0),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/earnings
router.get("/users/:id/earnings", async (req, res) => {
  try {
    const { id } = GetUserEarningsParams.parse({ id: Number(req.params.id) });
    const txs = await db
      .select({ tx: giftTransactionsTable })
      .from(giftTransactionsTable)
      .where(eq(giftTransactionsTable.receiverId, id))
      .limit(50);

    const [shareAgg] = await db
      .select({
        totalGross: sql<number>`COALESCE(SUM(${giftTransactionsTable.amount}), 0)`,
        streamerShare: sql<number>`COALESCE(SUM(${giftTransactionsTable.streamerShare}), 0)`,
        platformShare: sql<number>`COALESCE(SUM(${giftTransactionsTable.platformShare}), 0)`,
      })
      .from(giftTransactionsTable)
      .where(eq(giftTransactionsTable.receiverId, id));

    const totalGross = Number(shareAgg?.totalGross ?? 0);
    const streamerShare = Number(shareAgg?.streamerShare ?? 0);
    const platformShare = Number(shareAgg?.platformShare ?? 0);

    const [paidAgg] = await db
      .select({ paid: sql<number>`COALESCE(SUM(${payoutsTable.amount}), 0)` })
      .from(payoutsTable)
      .where(and(eq(payoutsTable.userId, id), eq(payoutsTable.status, "paid")));
    const paidOut = Number(paidAgg?.paid ?? 0);
    const pendingPayout = Math.max(0, streamerShare - paidOut);

    res.json({
      userId: id,
      totalGrossEarnings: totalGross,
      streamerShare,
      platformShare,
      pendingPayout,
      paidOut,
      transactions: txs.map((t) => ({
        ...t.tx,
        amount: Number(t.tx.amount),
        streamerShare: Number(t.tx.streamerShare),
        platformShare: Number(t.tx.platformShare),
        createdAt: t.tx.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/bank
router.get("/users/:id/bank", async (req, res) => {
  try {
    const { id } = GetUserBankAccountParams.parse({ id: Number(req.params.id) });
    const [bank] = await db
      .select()
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.userId, id))
      .orderBy(desc(bankAccountsTable.id))
      .limit(1);
    if (!bank) return res.status(404).json({ error: "No bank account linked" });
    res.json({ ...bank, createdAt: bank.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /users/:id/bank — replaces any existing linked bank for this user
router.post("/users/:id/bank", async (req, res) => {
  try {
    const { id } = LinkBankAccountParams.parse({ id: Number(req.params.id) });
    const body = LinkBankAccountBody.parse(req.body);
    const last4 = body.accountNumber.slice(-4);
    const bank = await db.transaction(async (tx) => {
      await tx.delete(bankAccountsTable).where(eq(bankAccountsTable.userId, id));
      const [row] = await tx.insert(bankAccountsTable).values({
        userId: id,
        bankName: body.bankName,
        last4,
        routingNumber: body.routingNumber,
        accountHolderName: body.accountHolderName,
        status: "verified",
      }).returning();
      return row;
    });
    res.status(201).json({ ...bank, createdAt: bank.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /users/:id/payout — withdraw pending earnings
router.post("/users/:id/payout", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

    const result = await db.transaction(async (tx) => {
      // Per-user advisory lock prevents concurrent withdraw races (double-pay).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);

      const [bank] = await tx
        .select()
        .from(bankAccountsTable)
        .where(eq(bankAccountsTable.userId, id))
        .orderBy(desc(bankAccountsTable.id))
        .limit(1);
      if (!bank) throw new Error("NO_BANK");

      const [shareAgg] = await tx
        .select({ s: sql<number>`COALESCE(SUM(${giftTransactionsTable.streamerShare}), 0)` })
        .from(giftTransactionsTable)
        .where(eq(giftTransactionsTable.receiverId, id));
      const streamerShare = Number(shareAgg?.s ?? 0);

      const [paidAgg] = await tx
        .select({ p: sql<number>`COALESCE(SUM(${payoutsTable.amount}), 0)` })
        .from(payoutsTable)
        .where(and(eq(payoutsTable.userId, id), eq(payoutsTable.status, "paid")));
      const paidOut = Number(paidAgg?.p ?? 0);

      const pending = Math.max(0, streamerShare - paidOut);
      if (pending <= 0) throw new Error("NO_BALANCE");

      const [payout] = await tx.insert(payoutsTable).values({
        userId: id,
        amount: String(pending.toFixed(2)),
        status: "paid",
        bankLast4: bank.last4,
      }).returning();
      return payout;
    });

    res.status(201).json({ ...result, amount: Number(result.amount), createdAt: result.createdAt.toISOString() });
  } catch (e: any) {
    if (e?.message === "NO_BANK") return res.status(400).json({ error: "Link a bank account before withdrawing." });
    if (e?.message === "NO_BALANCE") return res.status(400).json({ error: "No pending earnings to withdraw." });
    res.status(400).json({ error: String(e) });
  }
});

// GET /users/:id/payout — list payout history
router.get("/users/:id/payout", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await db.select().from(payoutsTable).where(eq(payoutsTable.userId, id)).orderBy(desc(payoutsTable.createdAt));
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount), createdAt: r.createdAt.toISOString() })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
