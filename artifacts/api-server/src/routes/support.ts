import { Router } from "express";
import { db } from "@workspace/db";
import { problemReportsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";
import { generateSupportReply } from "../lib/support";

const router = Router();

function serialize(r: typeof problemReportsTable.$inferSelect) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  };
}

// POST /support/reports — a creator reports a problem and gets an instant AI help reply.
router.post("/support/reports", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.appUserId;
    if (!userId) return res.status(401).json({ error: "Login required" });
    const category = (String(req.body?.category ?? "Other").trim().slice(0, 60)) || "Other";
    const message = String(req.body?.message ?? "").trim();
    if (message.length < 5) return res.status(400).json({ error: "Please describe the problem (at least a few words)." });
    if (message.length > 2000) return res.status(400).json({ error: "Please keep it under 2000 characters." });

    const aiResponse = await generateSupportReply(category, message);
    const [row] = await db
      .insert(problemReportsTable)
      .values({ userId, category, message, aiResponse: aiResponse ?? null })
      .returning();
    res.status(201).json(serialize(row));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /support/reports/mine — the signed-in creator's own report history.
router.get("/support/reports/mine", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.appUserId;
    if (!userId) return res.status(401).json({ error: "Login required" });
    const rows = await db
      .select()
      .from(problemReportsTable)
      .where(eq(problemReportsTable.userId, userId))
      .orderBy(desc(problemReportsTable.createdAt))
      .limit(50);
    res.json(rows.map(serialize));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /support/reports — admin: every report with reporter info.
router.get("/support/reports", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        r: problemReportsTable,
        u: {
          id: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        },
      })
      .from(problemReportsTable)
      .leftJoin(usersTable, eq(usersTable.id, problemReportsTable.userId))
      .orderBy(desc(problemReportsTable.createdAt))
      .limit(200);
    res.json(rows.map(({ r, u }) => ({ ...serialize(r), reporter: u })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /support/reports/:id — admin marks a report open/resolved.
router.patch("/support/reports/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
    const status = String(req.body?.status ?? "").trim();
    if (status !== "open" && status !== "resolved") return res.status(400).json({ error: "Invalid status" });
    const [row] = await db
      .update(problemReportsTable)
      .set({ status, resolvedAt: status === "resolved" ? new Date() : null })
      .where(eq(problemReportsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(serialize(row));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
