import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["user", "streamer", "admin"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  isVerified: boolean("is_verified").notNull().default(false),
  isLive: boolean("is_live").notNull().default(false),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  postCount: integer("post_count").notNull().default(0),
  totalViews: integer("total_views").notNull().default(0),
  role: userRoleEnum("role").notNull().default("user"),
  stripeAccountId: text("stripe_account_id"),
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false),
  authUserId: text("auth_user_id").unique(),
  suspendedUntil: timestamp("suspended_until"),
  isBanned: boolean("is_banned").notNull().default(false),
  offenseCount: integer("offense_count").notNull().default(0),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => usersTable.id),
  followingId: integer("following_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bankAccountsTable = pgTable("bank_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  bankName: text("bank_name").notNull(),
  last4: text("last4").notNull(),
  routingNumber: text("routing_number"),
  accountHolderName: text("account_holder_name").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export const insertFollowSchema = createInsertSchema(followsTable).omit({ id: true, createdAt: true });
export const insertBankAccountSchema = createInsertSchema(bankAccountsTable).omit({ id: true, createdAt: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type Follow = typeof followsTable.$inferSelect;
export type BankAccount = typeof bankAccountsTable.$inferSelect;
