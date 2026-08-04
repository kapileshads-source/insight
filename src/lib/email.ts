import "server-only";
import { Resend } from "resend";

/**
 * Transactional email.
 *
 * A hard constraint shapes every template here: the server cannot read a
 * student's data. So no email can contain a grade, a session, or a number of
 * hours slept — those live encrypted and only their browser can open them.
 *
 * That rules out the "here's your week in numbers" email most study apps send.
 * What's left is honest: tell them something is ready, and link to it.
 */

const FROM = process.env.EMAIL_FROM ?? "Insight <onboarding@resend.dev>";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export type SendResult = { ok: true } | { ok: false; error: string };

async function send(
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  const resend = client();

  // In development, or before a key exists, log instead of failing. A missing
  // key should never block a student from finishing signup.
  if (!resend) {
    console.log(`[email] to=${to} subject="${subject}"\n${body}`);
    return { ok: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text: body,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Couldn't send the email.",
    };
  }
}

function origin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/// The COPPA consent request. Written to be understood by a parent who has
/// never heard of this app and is deciding whether to trust it.
export async function sendParentConsent(
  parentEmail: string,
  childEmail: string,
  token: string,
): Promise<SendResult> {
  return send(
    parentEmail,
    "Permission needed for your child to use Insight",
    `${childEmail} signed up for Insight, a study tool for Frisco ISD students.

They are under 13, so the law requires your permission before anything about
them is collected. Nothing has been collected yet.

Give or refuse permission here:
${origin()}/consent/${token}

The short version:

  - Their data is encrypted on their own device. We hold scrambled data and
    no way to unscramble it.
  - No location tracking. They pick "Library" or "Home" from a list.
  - Frisco ISD is not involved and cannot see any of it.
  - Nothing is sold and there is no advertising.
  - You can withdraw permission at any time from that same link.

Longer answers: ${origin()}/privacy/parents

Doing nothing is also an answer. Without your permission the account stays
empty.

Kapilesh Rajaravisankar and Sahas Raghav Vijayakumar
kapilesh.rajaravi@gmail.com`,
  );
}

/// Canvas tokens expire every 90 days at FISD. A token made on the first day
/// of school dies in mid-November — about five weeks before December finals.
/// Warning early is the difference between a reconnect and a silent data gap
/// across the highest-stakes grades of the term.
export async function sendCanvasExpiryWarning(
  email: string,
  daysLeft: number,
): Promise<SendResult> {
  const urgency =
    daysLeft <= 0
      ? "Your Canvas connection has expired."
      : `Your Canvas connection expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;

  return send(
    email,
    daysLeft <= 0 ? "Reconnect Canvas" : `Canvas expires in ${daysLeft} days`,
    `${urgency}

Canvas caps access tokens at 90 days, so this happens roughly every term.
Making a new one takes about a minute:

${origin()}/canvas

Until it's reconnected, Insight records the time as missing rather than
counting it as a stretch where nothing was due — so your patterns don't get
quietly distorted by the gap.`,
  );
}

/// The weekly recap.
///
/// Deliberately contains no numbers. We cannot read them, and inventing a
/// summary from what the server *can* see — row counts and timestamps — would
/// be a worse email and a dishonest one.
export async function sendWeeklyRecap(email: string): Promise<SendResult> {
  return send(
    email,
    "Your week on Insight",
    `Your weekly recap is ready.

${origin()}/dashboard

It isn't in this email because we can't read your data — it's encrypted with
a key only you have, so the numbers only exist once your browser opens them.`,
  );
}
