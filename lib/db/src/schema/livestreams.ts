import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const streamStatusEnum = pgEnum("stream_status", ["live", "ended", "scheduled"]);

export const livestreamsTable = pgTable("livestreams", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  streamKey: text("stream_key"),
  playbackUrl: text("playback_url"),
  status: streamStatusEnum("status").notNull().default("scheduled"),
  viewerCount: integer("viewer_count").notNull().default(0),
  peakViewerCount: integer("peak_viewer_count").notNull().default(0),
  totalGiftsReceived: numeric("total_gifts_received", { precision: 10, scale: 2 }).notNull().default("0"),
  activeFilter: text("active_filter"),
  category: text("category"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  battleOpponentId: integer("battle_opponent_id"),
  battleScore: numeric("battle_score", { precision: 10, scale: 2 }).notNull().default("0"),
  battleOpponentScore: numeric("battle_opponent_score", { precision: 10, scale: 2 }).notNull().default("0"),
  battleEndsAt: timestamp("battle_ends_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLivestreamSchema = createInsertSchema(livestreamsTable).omit({ id: true, createdAt: true });

export type InsertLivestream = z.infer<typeof insertLivestreamSchema>;
export type Livestream = typeof livestreamsTable.$inferSelect;
