import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { livestreamsTable } from "./livestreams";

export const giftRarityEnum = pgEnum("gift_rarity", ["common", "rare", "epic", "legendary"]);

export const giftsTable = pgTable("gifts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  category: text("category").notNull(),
  animationUrl: text("animation_url"),
  iconUrl: text("icon_url"),
  description: text("description"),
  rarity: giftRarityEnum("rarity").notNull().default("common"),
  isActive: boolean("is_active").notNull().default(true),
});

export const giftTransactionsTable = pgTable("gift_transactions", {
  id: serial("id").primaryKey(),
  giftId: integer("gift_id").notNull().references(() => giftsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id),
  streamId: integer("stream_id").references(() => livestreamsTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  streamerShare: numeric("streamer_share", { precision: 10, scale: 2 }).notNull(),
  platformShare: numeric("platform_share", { precision: 10, scale: 2 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGiftSchema = createInsertSchema(giftsTable).omit({ id: true });
export const insertGiftTransactionSchema = createInsertSchema(giftTransactionsTable).omit({ id: true, createdAt: true });

export type InsertGift = z.infer<typeof insertGiftSchema>;
export type Gift = typeof giftsTable.$inferSelect;
export type GiftTransaction = typeof giftTransactionsTable.$inferSelect;
