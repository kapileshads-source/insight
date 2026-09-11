"use server";

import { z } from "zod";

import { getOrCreateUser } from "@/lib/user";
import { checkQuestion } from "@/lib/chat";
import { getChatAnswer } from "@/lib/llm";

/**
 * Asking a question about your own numbers.
 *
 * The browser sends an aggregate it computed itself, because only the browser
 * can read the data underneath it. This server forwards that to the model and
 * returns the answer; it stores nothing, so a question and its answer exist on
 * our side for the length of one request.
 *
 * The zod schema is the enforcement, not documentation. Every field the model
 * can see is listed here with a bound on it, which means a future caller
 * cannot widen what gets sent by passing more, there is nowhere for it to go.
 */

const factsSchema = z.object({
  gpaWeighted: z.number().min(0).max(6).nullable(),
  gpaUnweighted: z.number().min(0).max(5).nullable(),
  courses: z
    .array(
      z.object({
        name: z.string().max(120),
        percent: z.number().min(0).max(200).nullable(),
      }),
    )
    .max(12),
  sessionsThisWeek: z.number().int().min(0).max(500),
  minutesThisWeek: z.number().int().min(0).max(20_000),
  meanSleepHours: z.number().min(0).max(24).nullable(),
  openAssignments: z.number().int().min(0).max(1000),
  missingAssignments: z.number().int().min(0).max(1000),
  patterns: z.array(z.string().max(400)).max(8),
});

const schema = z.object({
  facts: factsSchema,
  // Capped hard. History is what a prompt injection accumulates in, and the
  // bill grows with every turn resent.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(1000),
      }),
    )
    .max(8),
  question: z.string().min(1).max(500),
});

export async function askAboutMyStats(input: unknown) {
  const user = await getOrCreateUser();
  if (!user) return { ok: false as const, error: "Not signed in" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "That didn't look right." };
  }

  // Checked here as well as in the browser. The client check is what makes a
  // refusal instant and free; this one is what makes it a rule, since the
  // action is reachable by direct POST.
  const verdict = checkQuestion(parsed.data.question);
  if (!verdict.allowed) {
    return { ok: false as const, error: verdict.reason };
  }

  return getChatAnswer(
    parsed.data.facts,
    parsed.data.history,
    parsed.data.question,
  );
}
