import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const problemReportsTable = pgTable("problem_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  category: text("category").notNull(),
  message: text("message").notNull(),
  aiResponse: text("ai_response"),
  status: text("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProblemReportSchema = createInsertSchema(problemReportsTable).omit({ id: true, createdAt: true });
export type InsertProblemReport = z.infer<typeof insertProblemReportSchema>;
export type ProblemReport = typeof problemReportsTable.$inferSelect;
