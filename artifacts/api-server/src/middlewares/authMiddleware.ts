import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import {
  clearSession,
  deleteSession,
  getOidcConfig,
  getSession,
  updateSession,
  SESSION_COOKIE,
  type SessionData,
} from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}
    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
      // The session id that actually authenticated this request (Bearer or
      // cookie). Used by /auth/session-token so the web client can persist the
      // currently-valid sid, not a stale Bearer token.
      authSessionId?: string | undefined;
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

function getBearerSid(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return undefined;
}

// Resolve a session id into a user, refreshing if needed. Returns null when the
// session is missing/invalid. The stale session row is removed; the cookie is
// only cleared for the cookie-backed sid so a stale Bearer token can never log
// out a user whose session cookie is still valid.
async function resolveSessionUser(
  sid: string,
  res: Response,
  isCookie: boolean,
): Promise<Express.User | null> {
  const session = await getSession(sid);
  if (!session?.user?.id) {
    if (isCookie) await clearSession(res, sid);
    else await deleteSession(sid);
    return null;
  }
  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) {
    if (isCookie) await clearSession(res, sid);
    else await deleteSession(sid);
    return null;
  }
  return refreshed.user;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  req.isAuthenticated = function (this: Request) { return this.user != null; } as Request["isAuthenticated"];

  const bearerSid = getBearerSid(req);
  const cookieSid = req.cookies?.[SESSION_COOKIE] as string | undefined;

  // Try the Bearer token first (mobile / iOS localStorage fallback). If it is
  // missing or stale, fall back to the cookie — without clearing the cookie.
  // When the Bearer sid matches the cookie sid they are the same session, so an
  // invalid one should clear the cookie (isCookie = true) rather than leave
  // stale residue.
  if (bearerSid) {
    const user = await resolveSessionUser(bearerSid, res, bearerSid === cookieSid);
    if (user) { req.user = user; req.authSessionId = bearerSid; return next(); }
  }

  if (cookieSid && cookieSid !== bearerSid) {
    const user = await resolveSessionUser(cookieSid, res, true);
    if (user) { req.user = user; req.authSessionId = cookieSid; return next(); }
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
