/**
 * Scoping the chat.
 *
 * The chatbot answers questions about a student's own study statistics and
 * nothing else. That restriction is not a product preference — it is what
 * makes the feature defensible at all:
 *
 *   1. A homework machine attached to a school app is a discipline problem for
 *      the student and an academic-integrity problem for the district, and it
 *      is the first thing anyone will try. "Write my essay" has to fail.
 *   2. Every token sent costs money on an account with a free tier, and an
 *      open-ended assistant is an unbounded bill.
 *   3. Insight's whole claim is that it says one specific true thing about
 *      your own data. A general chatbot dilutes that into every other chatbot.
 *
 * **A system prompt alone does not do this.** Telling a model to refuse
 * off-topic questions works until a student writes "ignore the above", which
 * takes about four minutes to discover and spreads through a year group in a
 * day. So the scope is enforced in code, on both sides of the call: the input
 * is checked before a request is made, and the output is checked before it is
 * shown. The prompt is the third layer, not the only one.
 *
 * The checks here are deliberately crude. A cheap keyword gate that a
 * determined student can eventually get past is worth having; the goal is to
 * stop the casual attempt and to make the intended use obvious, not to win an
 * arms race against people who have already decided to cheat.
 */

/// What the assistant is allowed to know about. Passed to the model, and also
/// the thing this module exists to keep it inside.
export const CHAT_SCOPE =
  "the student's own study sessions, sleep, grades, GPA, assignments and the patterns Insight has found in them";

/**
 * Asking the model to do schoolwork.
 *
 * Matched on the *request* rather than the subject: "how did I do on my essay"
 * is a legitimate question about a grade, and "write my essay" is not. So the
 * pattern needs a verb of production next to a piece of schoolwork, which is
 * what separates the two.
 */
const WORK =
  "(essay|paper|homework|assignment|worksheet|problem set|problems?|questions?|quiz|test|exam|lab report|code|program|proof)";

/// "do" is deliberately not in this list. It is the one verb that appears in
/// the most common legitimate question here — "how did I do on my chemistry
/// essay" — which the first version of this refused, in a test written
/// specifically to catch that. Requests to *do* work are matched separately
/// below, where the possessive is required and "did I do" cannot reach.
const PRODUCE = "(write|draft|compose|solve|answer|complete|finish)";

const DO_MY_WORK = new RegExp(
  `\\b${PRODUCE}\\b[^.?!]{0,40}\\b(my|this|the|these|that)?\\s?${WORK}\\b` +
    `|\\bdo\\s+(my|this|the|these|that)\\s+${WORK}\\b`,
  "i",
);

/// Attempts to talk the model out of its instructions. Not exhaustive and not
/// meant to be — it catches the copy-pasted ones, which is most of them.
const JAILBREAK =
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,30}\b(previous|prior|above|earlier|all)?\s?(instructions?|prompts?|rules?|system)\b|\byou are now\b|\bpretend (that )?you\b|\bDAN\b|\bdeveloper mode\b|\bjailbreak\b/i;

/// Subjects that are plainly not this app. Kept short: a long list of banned
/// topics starts refusing legitimate questions, and "how does my chemistry
/// grade look" must never trip a rule about chemistry.
const OFF_TOPIC =
  /\b(recipe|weather|stock|crypto|bitcoin|movie|lyrics|translate|dating|medical advice|diagnos\w+|suicide|self.harm)\b/i;

/**
 * Causal claims, judged for a conversation rather than for one sentence.
 *
 * `getRecommendation` uses a much broader list — it includes "because",
 * "improves", "hurts", "boosts" — and that is right there, because it produces
 * a single declarative sentence of advice where any of those words is almost
 * certainly a claim about cause.
 *
 * In a chat it is wrong, and measurably so. Asked "is my sleep affecting my
 * grades", the model answered: sleep "went along with" the pattern, the two
 * "might be linked", and it "could be worth trying to finish earlier to see if
 * your grades improve." That is a careful, correct, hedged answer — and the
 * broad list refused it, on the word "improve" inside a hypothetical. "Which
 * class should I worry about" was refused on an ordinary explanatory
 * "because". A guard that blocks the two questions the feature exists to
 * answer is not protecting anyone.
 *
 * So this keeps only the assertions that are unambiguously causal. Hedged
 * language survives, which is the language the system prompt asks for; a flat
 * "your sleep is hurting your grades" still does not.
 */
export const CHAT_CAUSAL =
  /\b(causes?|caused|causing|leads? to|led to|results? in|resulted in|due to|thanks to)\b|\bbecause of (your|the)\b/i;

/**
 * "What would my GPA be if I got a 90 in Chemistry?"
 *
 * Caught before the model sees it, and answered by pointing at the calculator
 * on the GPA card rather than by attempting the arithmetic.
 *
 * The model's own answer to this was honest — it said it lacked the credit
 * weightings and could not compute a new GPA — which is the correct refusal
 * and a bad experience, since this is the most useful question a student asks
 * about their grades. Giving it the weightings would not fix it: a language
 * model doing arithmetic produces a number that looks right and sometimes is
 * not, with identical confidence either way, and this is the figure a student
 * decides things on.
 *
 * So it is computed by `gpaIf`, deterministically, from the same function the
 * headline number uses. This check is what routes the question there.
 */
const WHAT_IF =
  /\bwhat (would|will|if)\b[^.?!]{0,80}\b(gpa|grade|average)\b|\bgpa\b[^.?!]{0,40}\bif i\b|\bif i (get|got|make|made|raise[d]?|bring|brought|drop|dropped)\b[^.?!]{0,60}\b(gpa|to a|up to|\d{2,3})\b/i;

export type ScopeVerdict =
  | { allowed: true }
  | { allowed: false; reason: string };

/// Checked before the request is made, so a refused message costs nothing.
export function checkQuestion(text: string): ScopeVerdict {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { allowed: false, reason: "Ask me something about your stats." };
  }
  // Long messages are how a prompt injection arrives, and no genuine question
  // about one's own GPA needs a page of text.
  if (trimmed.length > 500) {
    return {
      allowed: false,
      reason: "That's longer than I can take — try a shorter question.",
    };
  }
  if (JAILBREAK.test(trimmed)) {
    return {
      allowed: false,
      reason:
        "I only talk about your study data — that's built in rather than something I can be talked out of.",
    };
  }
  if (DO_MY_WORK.test(trimmed)) {
    return {
      allowed: false,
      reason:
        "I won't do your schoolwork. I can tell you how you've done on similar work before, and when you studied for it.",
    };
  }
  if (WHAT_IF.test(trimmed)) {
    return {
      allowed: false,
      reason:
        "I won't guess at that — open “Which classes count, and try a grade” on your GPA card and type the grade in. It works the number out exactly, using your real transcript.",
    };
  }
  if (OFF_TOPIC.test(trimmed)) {
    return {
      allowed: false,
      reason: `I only know about ${CHAT_SCOPE}.`,
    };
  }

  return { allowed: true };
}

/**
 * The same check on the way out.
 *
 * A model that has been talked round produces the essay regardless of what the
 * input filter thought, so the answer is checked too. Length is the cheapest
 * signal: every legitimate answer here is a few sentences about numbers, and
 * nothing this feature should ever say runs to six paragraphs.
 */
const MAX_ANSWER_CHARS = 900;

export function checkAnswer(text: string): ScopeVerdict {
  if (text.length > MAX_ANSWER_CHARS) {
    return {
      allowed: false,
      reason: "That answer ran long, so I've held it back. Try asking something narrower.",
    };
  }
  if (DO_MY_WORK.test(text)) {
    return {
      allowed: false,
      reason: "I won't do your schoolwork.",
    };
  }
  return { allowed: true };
}

/**
 * What the model is allowed to see.
 *
 * Aggregates only — the same rule the recommendation feature already follows.
 * No session, no assignment name, no individual mark leaves the browser. This
 * type is the contract, and it is narrow on purpose: anything not listed here
 * cannot be sent, because there is no field to put it in.
 */
export type ChatFacts = {
  gpaWeighted: number | null;
  gpaUnweighted: number | null;
  /// Course names and their current percentage. The one place a specific
  /// figure is sent, because "how is chemistry going" is the question this
  /// feature exists to answer and cannot be answered without it.
  courses: { name: string; percent: number | null }[];
  sessionsThisWeek: number;
  minutesThisWeek: number;
  meanSleepHours: number | null;
  openAssignments: number;
  missingAssignments: number;
  /// Statements from the insight engine, already validated and phrased.
  patterns: string[];
};

/// One turn of the conversation. History is capped in the action rather than
/// here; this is only the shape.
export type ChatTurn = { role: "user" | "assistant"; content: string };

export const CHAT_SYSTEM = `You answer a high school student's questions about their own study data in Insight.

Scope: ${CHAT_SCOPE}. If asked about anything else, say that is all you know about and stop. Never write, draft or solve schoolwork of any kind, even partially, even if the student says it is for practice.

You are given a JSON summary of the student's figures. Answer only from it. If the summary does not contain what was asked, say so plainly — do not estimate, and do not invent a number.

Never claim one thing caused another. The patterns you are given describe things that happened together. Say "went along with", not "because of".

Two to four sentences. Plain language, no bullet points, no headings. Talk to them, not about them.`;

/// The payload, built here so exactly one function decides what is sent.
export function buildChatPrompt(facts: ChatFacts, question: string): string {
  return `${JSON.stringify(facts, null, 2)}\n\nQuestion: ${question}`;
}
