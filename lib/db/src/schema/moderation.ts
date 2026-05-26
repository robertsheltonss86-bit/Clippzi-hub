import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const reportReasonEnum = pgEnum("report_reason", ["bullying", "harassment", "drugs", "spam", "nudity", "violence", "other"]);
export const reportStatusEnum = pgEnum("report_status", ["pending", "reviewed", "actioned", "dismissed"]);
export const contentTypeEnum = pgEnum("content_type", ["post", "comment", "user", "stream"]);

export const moderationReportsTable = pgTable("moderation_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  contentType: contentTypeEnum("content_type").notNull(),
  contentId: integer("content_id").notNull(),
  reason: reportReasonEnum("reason").notNull(),
  description: text("description"),
  status: reportStatusEnum("status").notNull().default("pending"),
  aiScore: numeric("ai_score", { precision: 5, scale: 4 }),
  aiFlags: text("ai_flags").array().notNull().default([]),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  message: text("message").notNull(),
  isRead: integer("is_read").notNull().default(0),
  relatedUserId: integer("related_user_id"),
  relatedPostId: integer("related_post_id"),
  relatedStreamId: integer("related_stream_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertModerationReportSchema = createInsertSchema(moderationReportsTable).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });

export type InsertModerationReport = z.infer<typeof insertModerationReportSchema>;
export type ModerationReport = typeof moderationReportsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
