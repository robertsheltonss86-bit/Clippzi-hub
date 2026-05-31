// Small wrapper around fetch for hand-written API calls (the generated client
// handles auth on its own). Sends the session cookie AND the persisted Bearer
// token so calls stay authenticated on iOS Safari / PWAs where cookies get
// purged. Mirrors the token key used by @workspace/replit-auth-web.
const TOKEN_KEY = "clippzi_auth_token";

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && !headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
  } catch {
    /* ignore storage errors (private mode, etc.) */
  }
  return headers;
}

// `path` is relative to the artifact base, e.g. "api/coins/balance".
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = import.meta.env.BASE_URL;
  return fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: authHeaders(init.headers),
  });
}
