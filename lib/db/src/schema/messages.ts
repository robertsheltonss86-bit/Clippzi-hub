import { pgTable, serial, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A 1:1 conversation between two users. user1Id is always the smaller id and
// user2Id the larger, so each pair has exactly one conversation row.
export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  user1Id: integer("user1_id").notNull().references(() => usersTable.id),
  user2Id: integer("user2_id").notNull().references(() => usersTable.id),
  lastMessageText: text("last_message_text"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  pairUnique: unique("conversations_pair_unique").on(t.user1Id, t.user2Id),
}));

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id),
  text: text("text").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });

export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
