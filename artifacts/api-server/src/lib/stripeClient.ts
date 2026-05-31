// Stripe client (Replit connector) — see integrations skill
import Stripe from "stripe";

async function getCredentials() {
  const isProduction = process.env["REPLIT_DEPLOYMENT"] === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  // Primary source: Replit Stripe connector for the current environment.
  try {
    const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
    const xReplitToken = process.env["REPL_IDENTITY"]
      ? "repl " + process.env["REPL_IDENTITY"]
      : process.env["WEB_REPL_RENEWAL"]
        ? "depl " + process.env["WEB_REPL_RENEWAL"]
        : null;

    if (hostname && xReplitToken) {
      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set("include_secrets", "true");
      url.searchParams.set("connector_names", "stripe");
      url.searchParams.set("environment", targetEnvironment);

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      });
      const data: any = await response.json();
      const item = data.items?.[0];
      if (item?.settings?.publishable && item?.settings?.secret) {
        return {
          publishableKey: item.settings.publishable as string,
          secretKey: item.settings.secret as string,
        };
      }
    }
  } catch {
    // Fall through to the production env-var fallback below.
  }

  // Production fallback: live keys supplied directly as secrets when the
  // connector has no production connection configured.
  if (isProduction) {
    const secretKey = process.env["STRIPE_SECRET_KEY"];
    const publishableKey = process.env["STRIPE_PUBLISHABLE_KEY"];
    if (secretKey && publishableKey) {
      return { publishableKey, secretKey };
    }
  }

  throw new Error(`Stripe ${targetEnvironment} connection not found`);
}

// Never cache — tokens expire.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}
