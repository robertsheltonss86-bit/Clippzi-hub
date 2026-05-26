// Stripe client (Replit connector) — see integrations skill
import Stripe from "stripe";

async function getCredentials() {
  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;
  if (!xReplitToken) throw new Error("X-Replit-Token not found for repl/depl");

  const isProduction = process.env["REPLIT_DEPLOYMENT"] === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const data: any = await response.json();
  const item = data.items?.[0];
  if (!item || !item.settings?.publishable || !item.settings?.secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }
  return { publishableKey: item.settings.publishable as string, secretKey: item.settings.secret as string };
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
