import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// A record of a real-money coin purchase. 1 coin = 1 cent ($0.01).
// `amountUsd` is the dollars charged via Stripe; `coins` is what we credit.
export const coinPurchasesTable = pgTable("coin_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  coins: integer("coins").notNull(),
  amountUsd: numeric("amount_usd", { precision: 10, scale: 2 }).notNull(),
  stripeSessionId: text("stripe_session_id").unique(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoinPurchaseSchema = createInsertSchema(coinPurchasesTable).omit({ id: true, createdAt: true });

export type InsertCoinPurchase = z.infer<typeof insertCoinPurchaseSchema>;
export type CoinPurchase = typeof coinPurchasesTable.$inferSelect;
