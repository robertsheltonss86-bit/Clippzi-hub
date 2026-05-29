import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  getSession,
  updateSession,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}
    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }
    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(sid: string, session: SessionData): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;
  if (!session.refresh_token) return null;
  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn() ? now + tokens.expiresIn()! : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  req.isAuthenticated = function (this: Request) { return this.user != null; } as Request["isAuthenticated"];
  const sid = getSessionId(req);
  if (!sid) return next();
  const session = await getSession(sid);
  if (!session?.user?.id) { await clearSession(res, sid); return next(); }
  // Try to refresh the OIDC access token, but do NOT log the user out if that
  // fails. After login we only need the app identity stored in the session, and
  // getSession() already enforces the session's own expiry. Previously, clearing
  // the session whenever the short-lived OIDC token couldn't be refreshed logged
  // users out roughly every hour ("every time I back out I have to log in again").
  const refreshed = await refreshIfExpired(sid, session);
  const active = refreshed ?? session;
  req.user = active.user;
  // Slide the session expiry forward on activity so active users stay logged in
  // until they explicitly log out. Throttle the DB write to at most ~twice a day
  // per session to avoid a write on every request.
  const nowSec = Math.floor(Date.now() / 1000);
  const TOUCH_INTERVAL = 12 * 60 * 60;
  if (!active.touched_at || nowSec - active.touched_at > TOUCH_INTERVAL) {
    active.touched_at = nowSec;
    void updateSession(sid, active).catch(() => {});
  }
  next();
}

// Guards for money-moving endpoints.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  next();
}

export function requireSelf(paramName = "id") {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
    const target = Number(req.params[paramName]);
    const me = req.user?.appUserId;
    if (!me || me !== target) { res.status(403).json({ error: "Forbidden — not your account" }); return; }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Login required" }); return; }
  if (!req.user?.isAdmin) { res.status(403).json({ error: "Admin only" }); return; }
  next();
}

// Blocks suspended or banned users from creating content (posts, comments, going live, chat).
export async function requireNotSuspended(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bodyUserId = req.body?.userId != null ? Number(req.body.userId) : undefined;
  const userId = req.user?.appUserId ?? bodyUserId;
  if (!userId) { next(); return; }
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!u) { next(); return; }
  if (u.isBanned) {
    res.status(403).json({
      error: "Your account has been permanently banned for violating Clippzi community guidelines.",
      banned: true,
    });
    return;
  }
  if (u.suspendedUntil && u.suspendedUntil > new Date()) {
    res.status(403).json({
      error: `Your account is suspended for violating Clippzi community guidelines. Access returns ${u.suspendedUntil.toLocaleString()}.`,
      suspendedUntil: u.suspendedUntil.toISOString(),
    });
    return;
  }
  next();
}
