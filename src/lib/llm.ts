import "server-only";

/**
 * Smart Recommendations.
 *
 * The guardrail from the plan, restated because it is the whole design: the
 * model only ever *phrases* a pattern the statistics engine has already
 * validated. It is never given raw sessions and asked to find something.
 * A model handed a study log will happily invent a correlation that isn't
 * there, and it will sound exactly as confident as a real one.
 *
 * So what crosses this boundary is a finished insight object — direction,
 * magnitude, sample size — plus upcoming assignment names. Never a session,
 * never a grade, never anything identifying.
 *
 * Provider-agnostic on purpose: swapping Groq for Anthropic is an env var,
 * not a rewrite.
 */

import {
  buildChatPrompt,
  checkAnswer,
  CHAT_SYSTEM,
  type ChatFacts,
  type ChatTurn,
} from "@/lib/chat";

export type InsightSummary = {
  statement: string;
  direction: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
  magnitude: number;
  sampleSize: number;
};

export type UpcomingItem = { name: string; dueAt: string | null };

export type RecommendationResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; error: string };

const SYSTEM = `You write one or two sentences of study advice for a high school student.

You are given patterns that have ALREADY been verified statistically. Your job
is only to phrase them usefully. Follow these rules exactly:

- Never invent a pattern, number, or cause. Use only what you are given.
- Never claim causation. Say "came before" or "lined up with", not "because"
  or "caused".
- Compare only to the student's own averages. Never cite a general
  recommendation such as eight hours of sleep.
- Be specific and practical. No filler like "study more" or "stay focused".
- Be encouraging without being saccharine. No exclamation marks.
- Two sentences maximum. Plain words. Do not use em dashes.
- If an upcoming assignment is given, tie the advice to it.`;

function buildPrompt(
  insights: InsightSummary[],
  upcoming: UpcomingItem[],
): string {
  return JSON.stringify(
    {
      verified_patterns: insights.map((i) => ({
        finding: i.statement,
        direction: i.direction,
        difference_in_percentage_points: i.magnitude,
        based_on_sessions: i.sampleSize,
      })),
      upcoming_work: upcoming.slice(0, 5),
    },
    null,
    2,
  );
}

async function callGroq(
  prompt: string,
  system: string = SYSTEM,
  maxTokens = 160,
): Promise<RecommendationResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, error: "No Groq API key configured." };

  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `Groq returned ${res.status}` };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) return { ok: false, error: "Groq returned nothing usable." };

  return { ok: true, text, provider: "groq", model };
}

async function callAnthropic(
  prompt: string,
): Promise<RecommendationResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "No Anthropic API key configured." };

  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 160,
      temperature: 0.4,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    return { ok: false, error: `Anthropic returned ${res.status}` };
  }

  const data = (await res.json()) as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text?.trim();
  if (!text) return { ok: false, error: "Anthropic returned nothing usable." };

  return { ok: true, text, provider: "anthropic", model };
}

/// Words that would mean the model ignored its instructions. Cheaper and more
/// reliable than trusting the prompt alone — a causal claim about a teenager's
/// grades is exactly the output worth refusing to display.
const CAUSAL = /\b(because|causes?|caused|causing|hurts?|harms?|boosts?|improves?|leads? to|results? in|due to)\b/i;

export async function getRecommendation(
  insights: InsightSummary[],
  upcoming: UpcomingItem[],
): Promise<RecommendationResult> {
  // The minimum bar from the plan: no call at all until something real exists
  // to phrase. Otherwise the model has nothing to work from and produces the
  // generic filler this feature is meant to avoid.
  if (insights.length === 0) {
    return { ok: false, error: "No validated patterns yet." };
  }

  const provider = (process.env.LLM_PROVIDER ?? "none").toLowerCase();
  if (provider === "none") {
    return { ok: false, error: "No provider configured." };
  }

  const prompt = buildPrompt(insights, upcoming);

  let result: RecommendationResult;
  try {
    result =
      provider === "anthropic"
        ? await callAnthropic(prompt)
        : await callGroq(prompt);
  } catch {
    return { ok: false, error: "Couldn't reach the recommendation service." };
  }

  if (!result.ok) return result;

  if (CAUSAL.test(result.text)) {
    return {
      ok: false,
      error: "The generated advice claimed causation, so it wasn't shown.",
    };
  }

  return result;
}


// --- chat -------------------------------------------------------------------

/**
 * One answer in the stats chat.
 *
 * Same boundary as `getRecommendation`: what crosses it is an aggregate the
 * browser computed, never rows. See `chat.ts` for the scope rules, which are
 * enforced on both sides of this call rather than trusted to the prompt.
 *
 * The history is included so a student can say "what about last week?" without
 * repeating themselves, but it is capped by the caller and every turn in it has
 * already been through the same checks.
 */
export async function getChatAnswer(
  facts: ChatFacts,
  history: ChatTurn[],
  question: string,
): Promise<RecommendationResult> {
  const provider = (process.env.LLM_PROVIDER ?? "none").toLowerCase();
  if (provider === "none") {
    return { ok: false, error: "No provider configured." };
  }
  // Only Groq for now. The Anthropic path takes a single prompt string and
  // would silently drop the history, which is worse than saying so.
  if (provider !== "groq") {
    return { ok: false, error: "Chat needs the Groq provider." };
  }

  const transcript = history
    .map((t) => `${t.role === "user" ? "Student" : "You"}: ${t.content}`)
    .join("\n");

  const prompt = transcript
    ? `Earlier in this conversation:\n${transcript}\n\n${buildChatPrompt(facts, question)}`
    : buildChatPrompt(facts, question);

  let result: RecommendationResult;
  try {
    result = await callGroq(prompt, CHAT_SYSTEM, 320);
  } catch {
    return { ok: false, error: "Couldn't reach the chat service." };
  }
  if (!result.ok) return result;

  // The causation guard applies here too. A model asked "why did my grade
  // drop" will reach for a cause, and the honest answer is that Insight only
  // knows what happened alongside what.
  if (CAUSAL.test(result.text)) {
    return {
      ok: false,
      error:
        "That answer claimed one thing caused another, which Insight can't actually tell. Try asking what happened alongside what.",
    };
  }

  const scoped = checkAnswer(result.text);
  if (!scoped.allowed) {
    return { ok: false, error: scoped.reason };
  }

  return result;
}
