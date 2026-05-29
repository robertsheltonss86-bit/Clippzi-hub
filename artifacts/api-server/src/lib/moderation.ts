import OpenAI from "openai";

export type ModerationDecision = "allow" | "flag" | "block";

export interface ModerationResult {
  decision: ModerationDecision;
  score: number;
  flags: string[];
  reason: string | null;
}

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  if (!BASE_URL || !API_KEY) return null;
  if (!client) client = new OpenAI({ baseURL: BASE_URL, apiKey: API_KEY });
  return client;
}

// Cheap keyword pre-filter. Returns "block" for obviously harmful content so we
// can short-circuit before paying for an API call. Returns null when undecided.
const HARD_BLOCK_WORDS = [
  "kill yourself",
  "kys",
  "i will find you",
  "i'll find you",
  "child porn",
  "cp",
];
const DRUG_WORDS = ["cocaine", "meth", "heroin", "fentanyl", "mdma", "ecstasy", "lsd"];

function keywordPrefilter(text: string): ModerationResult | null {
  const lower = text.toLowerCase();
  for (const w of HARD_BLOCK_WORDS) {
    if (lower.includes(w)) {
      return { decision: "block", score: 1, flags: ["self_harm_or_threat"], reason: "keyword:" + w };
    }
  }
  let drugHits = 0;
  for (const w of DRUG_WORDS) if (lower.includes(w)) drugHits++;
  if (drugHits >= 2) {
    return { decision: "block", score: 0.95, flags: ["drugs"], reason: "keyword:drugs" };
  }
  return null;
}

// Maps OpenAI omni-moderation categories to our report-reason flags.
function mapCategories(categories: Record<string, boolean>): string[] {
  const flags = new Set<string>();
  for (const [cat, hit] of Object.entries(categories)) {
    if (!hit) continue;
    if (cat.startsWith("harassment")) flags.add("harassment");
    else if (cat.startsWith("hate")) flags.add("harassment");
    else if (cat.startsWith("self-harm")) flags.add("self_harm");
    else if (cat.startsWith("sexual/minors")) flags.add("nudity");
    else if (cat.startsWith("sexual")) flags.add("nudity");
    else if (cat.startsWith("violence")) flags.add("violence");
    else if (cat.startsWith("illicit")) flags.add("drugs");
    else flags.add("other");
  }
  return Array.from(flags);
}

const BLOCK_THRESHOLD = 0.7;
const FLAG_THRESHOLD = 0.35;

/**
 * Analyze user-generated text. Always resolves (never throws) — on any error we
 * fail open to "allow" so a moderation outage can't take the product down.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { decision: "allow", score: 0, flags: [], reason: null };

  const pre = keywordPrefilter(trimmed);
  if (pre) return pre;

  const ai = getClient();
  if (!ai) return { decision: "allow", score: 0, flags: [], reason: null };

  try {
    const resp = await ai.moderations.create({
      model: "omni-moderation-latest",
      input: trimmed,
    });
    const r = resp.results?.[0];
    if (!r) return { decision: "allow", score: 0, flags: [], reason: null };

    const scores = r.category_scores as unknown as Record<string, number>;
    const maxScore = Math.max(0, ...Object.values(scores ?? {}));
    const flags = mapCategories(r.categories as unknown as Record<string, boolean>);

    let decision: ModerationDecision = "allow";
    // OpenAI's own flag OR a high score → block. Borderline → flag for review.
    if (r.flagged && maxScore >= BLOCK_THRESHOLD) decision = "block";
    else if (maxScore >= BLOCK_THRESHOLD) decision = "block";
    else if (r.flagged || maxScore >= FLAG_THRESHOLD) decision = "flag";

    return {
      decision,
      score: Math.round(maxScore * 10000) / 10000,
      flags: flags.length ? flags : decision === "allow" ? [] : ["other"],
      reason: flags.length ? flags.join(", ") : null,
    };
  } catch {
    // Fail open — don't block users when the moderation service is unavailable.
    return { decision: "allow", score: 0, flags: [], reason: null };
  }
}

export const GUIDELINES_BLOCK_MESSAGE =
  "This couldn't be posted — it looks like it may violate our Community Guidelines.";

// Maps a moderation flag to a valid report_reason enum value.
export function flagToReportReason(flags: string[]): "bullying" | "harassment" | "drugs" | "spam" | "nudity" | "violence" | "other" {
  const f = flags[0] ?? "other";
  if (f === "harassment" || f === "bullying") return "harassment";
  if (f === "drugs") return "drugs";
  if (f === "nudity") return "nudity";
  if (f === "violence") return "violence";
  if (f === "self_harm" || f === "self_harm_or_threat") return "other";
  return "other";
}
