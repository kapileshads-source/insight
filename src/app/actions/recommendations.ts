"use server";

import { z } from "zod";
import { getOrCreateUser } from "@/lib/user";
import { getRecommendation } from "@/lib/llm";

const schema = z.object({
  insights: z
    .array(
      z.object({
        statement: z.string().max(400),
        direction: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
        magnitude: z.number(),
        sampleSize: z.number().int(),
      }),
    )
    .min(1)
    .max(5),
  upcoming: z
    .array(
      z.object({
        name: z.string().max(200),
        dueAt: z.string().nullable(),
      }),
    )
    .max(5),
});

/// Phrase already-validated insights as advice.
///
/// The browser sends the finished insight objects it computed, because only
/// the browser can read the data they came from. The server forwards them and
/// returns the text — it stores nothing, so the sentence exists on our side
/// for the length of one request and no longer.
export async function requestRecommendation(input: unknown) {
  const user = await getOrCreateUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "That didn't look right." };
  }

  return getRecommendation(parsed.data.insights, parsed.data.upcoming);
}
