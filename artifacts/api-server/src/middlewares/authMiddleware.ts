import * as oidc from "openid-client";
import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
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
  const refreshed = await refreshIfExpired(sid, session);
  if (!refreshed) { await clearSession(res, sid); return next(); }
  req.user = refreshed.user;
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
