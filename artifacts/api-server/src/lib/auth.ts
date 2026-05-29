import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable, usersTable, authUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "@workspace/api-zod";

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }
  return row.sess as unknown as SessionData;
}

export async function updateSession(sid: string, data: SessionData): Promise<void> {
  await db.update(sessionsTable)
    .set({ sess: data as unknown as Record<string, unknown>, expire: new Date(Date.now() + SESSION_TTL) })
    .where(eq(sessionsTable.sid, sid));
}

export async function deleteSession(sid: string): Promise<void> {
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
}

export async function clearSession(res: Response, sid?: string): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies?.[SESSION_COOKIE];
}

// Link OIDC identity → app user. Find by authUserId, else by email (claim existing app user), else create new.
export async function linkAppUser(authUserId: string, email: string | null): Promise<{ appUserId: number; isAdmin: boolean }> {
  let appUser = (await db.select().from(usersTable).where(eq(usersTable.authUserId, authUserId)))[0];
  if (!appUser && email) {
    appUser = (await db.select().from(usersTable).where(eq(usersTable.email, email)))[0];
    if (appUser) {
      await db.update(usersTable).set({ authUserId }).where(eq(usersTable.id, appUser.id));
    }
  }
  if (!appUser) {
    const baseHandle = (email?.split("@")[0] ?? `user_${authUserId.slice(0, 8)}`).toLowerCase().replace(/[^a-z0-9_]/g, "");
    const username = `${baseHandle}_${authUserId.slice(0, 6)}`;
    const [created] = await db.insert(usersTable).values({
      username,
      displayName: baseHandle || "Clippzi User",
      email: email ?? `${username}@clippzi.local`,
      authUserId,
    }).returning();
    appUser = created;
  }
  return { appUserId: appUser.id, isAdmin: appUser.role === "admin" };
}
