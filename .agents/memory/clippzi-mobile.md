---
name: Clippzi Expo mobile app
description: Gotchas building the clippzi-mobile Expo artifact against the shared api-server + generated hooks.
---

# Clippzi mobile (artifacts/clippzi-mobile)

Native Expo app that reuses `@workspace/api-server` via `@workspace/api-client-react` generated hooks.
Base URL + bearer auth are wired in `lib/api.ts` as an import side-effect (`setBaseUrl`/`setAuthTokenGetter`).

## SecureStore hangs the whole app on web preview
`expo-secure-store` is unavailable/unreliable on web — its async getter can hang and never resolve.
Because the auth token getter is awaited before *every* request in custom-fetch, a hanging getter
freezes all queries (feed shows an infinite spinner with no console error).
**Rule:** guard the token getter with `Platform.OS === "web"` → return null, and wrap native reads in try/catch.
**How to apply:** any Expo code that calls SecureStore in a hot path (auth getter, startup) must short-circuit on web.

## createComment needs postId NOT in the generated CommentInput type
The OpenAPI `CommentInput` schema is `{ userId, text }`, but the server (`posts.ts` POST /comments)
reads `postId` directly off `req.body`. So you must send `postId` in the body even though the generated
type omits it — pass `{ data: { userId, text, postId } as CommentInput & { postId: number } }`.
**Why:** spec/schema drift; the body field is read outside the validated schema.

## Mobile token-exchange: nonce is optional
`POST /api/mobile-auth/token-exchange` accepts `{ code, code_verifier, redirect_uri, state, nonce? }`.
expo-auth-session's `AuthRequest` has no `nonce` property, so just omit it — server uses `nonce ?? undefined`.
