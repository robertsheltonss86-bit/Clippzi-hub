import { pgTable, serial, text, integer, timestamp, unique, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const storyTypeEnum = pgEnum("story_type", ["video", "image"]);

// A short-lived story posted by a user. Expires (typically 24h) after which it
// is filtered out of the feed bubbles.
export const storiesTable = pgTable("stories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: storyTypeEnum("type").notNull(),
  mediaUrl: text("media_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Tracks which viewer has seen which story, so bubbles can show an unseen ring.
export const storyViewsTable = pgTable("story_views", {
  id: serial("id").primaryKey(),
  storyId: integer("story_id").notNull().references(() => storiesTable.id),
  viewerId: integer("viewer_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  storyViewerUnique: unique("story_views_story_viewer_unique").on(t.storyId, t.viewerId),
}));

export const insertStorySchema = createInsertSchema(storiesTable).omit({ id: true, createdAt: true });

export type Story = typeof storiesTable.$inferSelect;
export type StoryView = typeof storyViewsTable.$inferSelect;
export type InsertStory = z.infer<typeof insertStorySchema>;
