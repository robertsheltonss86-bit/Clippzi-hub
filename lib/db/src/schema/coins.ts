import { pgTable, serial, integer, numeric, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const coinLedgerTypeEnum = pgEnum("coin_ledger_type", ["purchase", "spend", "refund"]);

// Audit log of every coin movement (purchases credit coins, gift sends spend them).
export const coinLedgerTable = pgTable("coin_ledger", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: coinLedgerTypeEnum("type").notNull(),
  coins: integer("coins").notNull(), // positive for purchase/refund, negative for spend
  usd: numeric("usd", { precision: 10, scale: 2 }), // USD value involved (pack price or gift price)
  balanceAfter: integer("balance_after").notNull(),
  refId: text("ref_id"), // gift transaction id, pack id, etc.
  stripeSessionId: text("stripe_session_id").unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCoinLedgerSchema = createInsertSchema(coinLedgerTable).omit({ id: true, createdAt: true });

export type InsertCoinLedger = z.infer<typeof insertCoinLedgerSchema>;
export type CoinLedger = typeof coinLedgerTable.$inferSelect;
