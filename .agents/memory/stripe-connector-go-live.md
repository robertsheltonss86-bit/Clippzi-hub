---
name: Stripe connector go-live
description: Why a published Replit Stripe-connector app fails with "production connection not found" and the env-var fallback that fixes it.
---

# Stripe connector go-live (production credential resolution)

A Replit Stripe-connector app resolves keys from the connector proxy per environment:
development → sandbox/test connection, production → live connection. The published
app throws `Stripe production connection not found` whenever the connector has **no
production connection**, which happens if the live keys were never entered in the
Publish pane (easy to miss/skip, especially on mobile).

**Fix that works reliably:** in `getCredentials()` try the connector first, then fall
back to `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` env secrets **gated to
production only** (`REPLIT_DEPLOYMENT === "1"`).

**Why:** Non-technical owners repeatedly fail the Publish-pane Stripe-key step.
Env secrets requested via `requestEnvVar` are a far simpler, verifiable path. Gating
to production preserves dev/prod separation: dev's connector sandbox connection
exists and is tried first, so dev never consumes live keys even though Replit secrets
are global (not environment-scoped).

**How to apply:**
- The app reads keys from the connector proxy, NOT from process.env by default — adding
  generic deployment secrets does nothing unless the code has this fallback.
- After adding the secrets, the owner must **re-publish** so the deployment runs the
  new code AND picks up the secrets. Secrets alone on old deployed code won't help.
- Don't tell users to paste live keys into chat; request them via `requestEnvVar`.
