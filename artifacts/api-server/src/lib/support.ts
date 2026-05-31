import OpenAI from "openai";

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!BASE_URL || !API_KEY) return null;
  if (!client) client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are Clippzi's friendly in-app support assistant. Clippzi is a TikTok-style
app where creators post short videos, go live, buy coins, and send each other gifts. Creators keep 70%
of gift value and can cash out through their saved payout method (PayPal, Cash App, Venmo, Zelle, or
another option they set up in their profile). To go live, a creator must first set up how they want to
get paid (one time, in their profile).

You are talking to a non-technical creator. Write a short, warm, plain-English answer with clear
step-by-step instructions (use simple numbered steps when helpful). Keep it under about 150 words.
Only describe features that actually exist (videos, live, coins, gifts, earnings/payouts, profile,
uploading). Never invent settings or menus. If the problem sounds like a bug, a payment dispute, or
something you can't fully solve, reassure them and tell them they can email Clippziapp@gmail.com to
reach a live technician. Always end by inviting them to email Clippziapp@gmail.com if they're still
stuck.`;

// Generates an instant help reply for a creator's reported problem. Fail-soft:
// returns null if the AI integration isn't configured or the call errors, so a
// report is still saved and the UI can show the email escape hatch.
export async function generateSupportReply(category: string, message: string): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;
  try {
    const resp = await ai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Category: ${category}\n\nProblem: ${message}` },
      ],
    });
    return resp.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}
