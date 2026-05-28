import { Router } from "express";
import { db } from "@workspace/db";
import { moderationReportsTable, notificationsTable, usersTable, postsTable, commentsTable, liveChatMessagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import {
  ListModerationReportsQueryParams,
  CreateModerationReportBody,
  ResolveModerationReportParams,
  ResolveModerationReportBody,
  ModerateUserBody,
  ListNotificationsQueryParams,
  MarkNotificationReadParams,
  MarkNotificationReadBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

// Keyword-based AI moderation
function analyzeText(text: string) {
  const lower = text.toLowerCase();
  const bullyingWords = ["stupid", "idiot", "loser", "ugly", "worthless", "hate you", "kill yourself", "kys"];
  const drugWords = ["cocaine", "meth", "heroin", "fentanyl", "crack", "weed", "marijuana", "mdma", "ecstasy", "lsd", "acid"];
  const harassWords = ["stalking", "threat", "follow you", "find you", "address"];

  const bullyingScore = bullyingWords.reduce((s, w) => lower.includes(w) ? s + 0.3 : s, 0);
  const drugScore = drugWords.reduce((s, w) => lower.includes(w) ? s + 0.4 : s, 0);
  const harassScore = harassWords.reduce((s, w) => lower.includes(w) ? s + 0.35 : s, 0);

  const flags: string[] = [];
  if (bullyingScore > 0) flags.push("bullying");
  if (drugScore > 0) flags.push("drug_content");
  if (harassScore > 0) flags.push("harassment");

  const score = Math.min(bullyingScore + drugScore + harassScore, 1.0);
  const isSafe = score < 0.3;

  return {
    isSafe,
    score: Math.round(score * 100) / 100,
    flags,
    categories: {
      bullying: Math.min(bullyingScore, 1),
      drugUse: Math.min(drugScore, 1),
      harassment: Math.min(harassScore, 1),
      spam: 0,
    },
    recommendation: score > 0.7 ? "block" : score > 0.4 ? "review" : score > 0.2 ? "warn" : "allow" as "allow" | "warn" | "review" | "block",
  };
}

// GET /moderation/reports
router.get("/moderation/reports", requireAdmin, async (req, res) => {
  try {
    const query = ListModerationReportsQueryParams.parse(req.query);
    let q = db.select().from(moderationReportsTable).$dynamic();
    if (query.status) q = q.where(eq(moderationReportsTable.status, query.status as "pending" | "reviewed" | "actioned" | "dismissed"));
    const reports = await q.orderBy(desc(moderationReportsTable.createdAt));
    const enriched = await Promise.all(reports.map(async (r) => {
      const [reporter] = r.reporterId
        ? await db.select().from(usersTable).where(eq(usersTable.id, r.reporterId))
        : [null];
      return {
        ...r,
        aiScore: r.aiScore ? Number(r.aiScore) : null,
        aiFlags: r.aiFlags ?? [],
        reporter: reporter ? { ...reporter, createdAt: reporter.createdAt.toISOString() } : null,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
      };
    }));
    res.json(enriched);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /moderation/reports
router.post("/moderation/reports", requireAuth, async (req, res) => {
  try {
    const body = CreateModerationReportBody.parse(req.body);
    // Trust the authenticated session for the reporter identity, not the client payload.
    const reporterId = req.user?.appUserId ?? body.reporterId ?? null;
    const [report] = await db.insert(moderationReportsTable).values({
      reporterId,
      contentType: body.contentType as "post" | "comment" | "user" | "stream",
      contentId: body.contentId,
      reason: body.reason as "bullying" | "harassment" | "drugs" | "spam" | "nudity" | "violence" | "other",
      description: body.description ?? null,
      status: "pending",
      aiScore: null,
      aiFlags: [],
    }).returning();
    const [reporter] = report.reporterId
      ? await db.select().from(usersTable).where(eq(usersTable.id, report.reporterId))
      : [null];
    res.status(201).json({
      ...report,
      aiScore: null,
      aiFlags: [],
      reporter: reporter ? { ...reporter, createdAt: reporter.createdAt.toISOString() } : null,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: null,
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /moderation/analyze
router.post("/moderation/analyze", async (req, res) => {
  try {
    const { text } = req.body as { text: string; context?: string };
    if (!text) return res.status(400).json({ error: "text is required" });
    const result = analyzeText(text);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /moderation/reports/:id
router.patch("/moderation/reports/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = ResolveModerationReportParams.parse({ id: Number(req.params.id) });
    const body = ResolveModerationReportBody.parse(req.body);
    const [existing] = await db.select().from(moderationReportsTable).where(eq(moderationReportsTable.id, id));
    if (!existing) return res.status(404).json({ error: "Report not found" });

    // "actioned" = admin removes the offending content from the platform.
    if (body.status === "actioned") {
      if (existing.contentType === "post") {
        await db.update(postsTable)
          .set({ moderationStatus: "rejected" })
          .where(eq(postsTable.id, existing.contentId));
      } else if (existing.contentType === "comment") {
        const [c] = await db.select().from(commentsTable).where(eq(commentsTable.id, existing.contentId));
        if (c) {
          await db.delete(commentsTable).where(eq(commentsTable.id, existing.contentId));
          await db.update(postsTable)
            .set({ commentCount: sql`GREATEST(${postsTable.commentCount} - 1, 0)` })
            .where(eq(postsTable.id, c.postId));
        }
      } else if (existing.contentType === "stream") {
        await db.delete(liveChatMessagesTable).where(eq(liveChatMessagesTable.id, existing.contentId));
      }
    }

    const [report] = await db.update(moderationReportsTable).set({
      status: body.status as "reviewed" | "actioned" | "dismissed",
      resolvedAt: new Date(),
    }).where(eq(moderationReportsTable.id, id)).returning();
    if (!report) return res.status(404).json({ error: "Report not found" });
    const [reporter] = report.reporterId
      ? await db.select().from(usersTable).where(eq(usersTable.id, report.reporterId))
      : [null];
    res.json({
      ...report,
      aiScore: report.aiScore ? Number(report.aiScore) : null,
      aiFlags: report.aiFlags ?? [],
      reporter: reporter ? { ...reporter, createdAt: reporter.createdAt.toISOString() } : null,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /moderation/users/:id/action — admin applies escalating suspension, lifetime ban, or clears a user.
router.post("/moderation/users/:id/action", requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) return res.status(400).json({ error: "Invalid user id" });
    const body = ModerateUserBody.parse(req.body);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    // If a report drives this action, verify it targets this user and is still pending.
    // This prevents replaying the same report to inflate the offense count or resolving an unrelated report.
    if (body.reportId != null) {
      const [report] = await db.select().from(moderationReportsTable).where(eq(moderationReportsTable.id, body.reportId));
      if (!report) return res.status(404).json({ error: "Report not found" });
      if (report.contentType !== "user" || report.contentId !== userId) {
        return res.status(400).json({ error: "Report does not match this user" });
      }
      if (report.status !== "pending") {
        return res.status(409).json({ error: "Report has already been resolved" });
      }
    }

    let updates: Partial<typeof usersTable.$inferInsert>;
    if (body.action === "ban") {
      updates = {
        isBanned: true,
        suspendedUntil: null,
        offenseCount: user.offenseCount + 1,
        suspensionReason: body.reason ?? "Severe violation of Clippzi community guidelines",
      };
    } else if (body.action === "suspend") {
      const newCount = user.offenseCount + 1;
      const hours = newCount === 1 ? 1 : newCount === 2 ? 5 : 24;
      updates = {
        isBanned: false,
        offenseCount: newCount,
        suspendedUntil: new Date(Date.now() + hours * 60 * 60 * 1000),
        suspensionReason: body.reason ?? "Violation of Clippzi community guidelines",
      };
    } else {
      // clear — restore access (admin decided it wasn't bad enough).
      updates = { isBanned: false, suspendedUntil: null, suspensionReason: null };
    }

    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();

    if (body.reportId) {
      await db.update(moderationReportsTable).set({
        status: body.action === "clear" ? "dismissed" : "actioned",
        resolvedAt: new Date(),
      }).where(eq(moderationReportsTable.id, body.reportId));
    }

    res.json({
      ...updated,
      role: updated.role ?? "user",
      suspendedUntil: updated.suspendedUntil?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /notifications
router.get("/notifications", async (req, res) => {
  try {
    const query = ListNotificationsQueryParams.parse(req.query);
    let q = db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, query.userId)).$dynamic();
    if (query.unreadOnly) q = q.where(eq(notificationsTable.isRead, 0));
    const notifications = await q.orderBy(desc(notificationsTable.createdAt));
    res.json(notifications.map((n) => ({
      ...n,
      isRead: n.isRead === 1,
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /notifications/:id/read
router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const { id } = MarkNotificationReadParams.parse({ id: Number(req.params.id) });
    const body = MarkNotificationReadBody.parse(req.body);
    const [notification] = await db.update(notificationsTable).set({
      isRead: body.isRead ? 1 : 0,
    }).where(eq(notificationsTable.id, id)).returning();
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    res.json({ ...notification, isRead: notification.isRead === 1, createdAt: notification.createdAt.toISOString() });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
