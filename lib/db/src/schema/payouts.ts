import { pgTable, serial, integer, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("paid"),
  bankLast4: text("bank_last4").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const platformBankTable = pgTable("platform_bank", {
  id: serial("id").primaryKey(),
  bankName: text("bank_name").notNull(),
  last4: text("last4").notNull(),
  routingNumber: text("routing_number"),
  accountHolderName: text("account_holder_name").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const platformPayoutsTable = pgTable("platform_payouts", {
  id: serial("id").primaryKey(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("paid"),
  bankLast4: text("bank_last4").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPayoutSchema = createInsertSchema(payoutsTable).omit({ id: true, createdAt: true });
export type Payout = typeof payoutsTable.$inferSelect;
export type PlatformBank = typeof platformBankTable.$inferSelect;
export type PlatformPayout = typeof platformPayoutsTable.$inferSelect;
