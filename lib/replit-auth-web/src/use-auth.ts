import { useState, useEffect, useCallback } from "react";
import { setAuthTokenGetter, type AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

// The session token is persisted in localStorage and sent as a Bearer token in
// addition to the httpOnly session cookie. iOS Safari, in-app browsers, and
// home-screen PWAs frequently purge cookies when the app is closed, which logs
// users out and makes it look like their account/posts disappeared. localStorage
// survives those purges, so the Bearer token keeps the user signed in.
const TOKEN_KEY = "clippzi_auth_token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
}

// Register globally so every generated API client request also carries the
// Bearer token, not just the auth check below.
setAuthTokenGetter(() => getStoredToken());

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredToken();
      try {
        const res = await fetch("/api/auth/user", {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { user: AuthUser | null };
        if (cancelled) return;

        if (data.user) {
          setUser(data.user);
          // We are authenticated (via cookie or token). Always sync the stored
          // token to the *current* valid session id. This both seeds the token
          // after a fresh cookie login and self-heals a stale token (e.g. after
          // a re-login created a new session) so future cookie-less loads stay
          // logged in.
          try {
            const tokenRes = await fetch("/api/auth/session-token", {
              credentials: "include",
              headers: token ? { authorization: `Bearer ${token}` } : undefined,
            });
            if (tokenRes.ok) {
              const tokenData = (await tokenRes.json()) as { token: string | null };
              if (!cancelled && tokenData.token && tokenData.token !== token) {
                setStoredToken(tokenData.token);
              }
            }
          } catch {
            /* non-fatal: current session still works for this load */
          }
        } else {
          setUser(null);
          // Session is invalid/expired — drop any stale token.
          if (token) setStoredToken(null);
        }
        setIsLoading(false);
      } catch {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/+$/, "") || "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    window.location.href = "/api/logout";
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
