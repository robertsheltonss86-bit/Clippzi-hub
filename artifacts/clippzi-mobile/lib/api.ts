/**
 * Module-level API client configuration for the Expo bundle.
 *
 * Importing this file for its side effects (done once in app/_layout.tsx)
 * wires the shared @workspace/api-client-react fetch layer to talk to the
 * remote API server with a bearer token from secure storage.
 */
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export const AUTH_TOKEN_KEY = "auth_session_token";

const domain = process.env.EXPO_PUBLIC_DOMAIN;

if (domain) {
  setBaseUrl(`https://${domain}`);
}

// SecureStore is unavailable/unreliable on web (it can hang or throw), which
// would block every API request. Skip it on web and fail soft on native.
setAuthTokenGetter(async () => {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
});

/**
 * Resolve a possibly-relative media path (e.g. "/api/storage/objects/...")
 * to an absolute URL that React Native can load.
 */
export function mediaUri(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//.test(url)) return url;
  if (!domain) return url;
  return `https://${domain}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Build the stored mediaUrl for an uploaded object path. */
export function storageUri(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

/** Compact, social-style number formatting (1.2K, 3.4M). */
export function formatCount(n: number | null | undefined): string {
  const v = n ?? 0;
  if (v < 1000) return String(v);
  if (v < 1_000_000)
    return (v / 1000).toFixed(v % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}
