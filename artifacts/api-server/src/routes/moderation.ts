import { Router } from "express";
import { db } from "@workspace/db";
import { moderationReportsTable, notificationsTable, usersTable, postsTable, commentsTable, liveChatMessagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/authMiddleware";
import {
  ListModerationReportsQueryParams,
  CreateModerationReportBody,
  ResolveModerationReportParams,
  ResolveModerationReportBody,
  ListNotificationsQueryParams,
  MarkNotificationReadParams,
  MarkNotificationReadBody,
} from "@workspace/api-zod";

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

// GET /moderation/reports (admin-only review queue)
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

// POST /moderation/reports (any logged-in user can report content)
router.post("/moderation/reports", requireAuth, async (req, res) => {
  try {
    const body = CreateModerationReportBody.parse(req.body);
    // Trust the authenticated user for the reporter id, never the request body.
    const reporterId = req.user!.appUserId ?? body.reporterId;
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
router.post("/moderation/analyze", requireAuth, async (req, res) => {
  try {
    const { text } = req.body as { text: string; context?: string };
    if (!text) return res.status(400).json({ error: "text is required" });
    const result = analyzeText(text);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /moderation/reports/:id (admin-only — resolves/removes reported content)
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
