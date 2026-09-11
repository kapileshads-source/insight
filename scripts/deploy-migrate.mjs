/**
 * Apply pending migrations as part of the build.
 *
 * Schema changes and code changes ship in the same commit, so they should
 * reach production together. Doing this by hand meant the code arrived with a
 * column the database didn't have yet, and every query touching it returned a
 * 500 that looked like an auth problem.
 *
 * Two details that matter:
 *
 * Migrations need a direct connection. Neon's pooled endpoint is PgBouncer in
 * transaction mode, which can't hold the session state DDL requires, so
 * DIRECT_DATABASE_URL is preferred when set.
 *
 * A missing DATABASE_URL is skipped rather than fatal, so `npm run build` on a
 * laptop with no database configured still works.
 */

import { spawnSync } from "node:child_process";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.log("[migrate] No DATABASE_URL set, skipping.");
  process.exit(0);
}

if (!process.env.DIRECT_DATABASE_URL && /-pooler\./.test(url)) {
  console.warn(
    "[migrate] Using a pooled connection. If this fails, set DIRECT_DATABASE_URL " +
      "to Neon's direct (non-pooler) string, migrations need session mode.",
  );
}

/**
 * Retry on an unreachable database.
 *
 * Neon's free tier suspends a compute after a few minutes idle, and the first
 * connection to a sleeping one is refused rather than queued while it wakes,
 * Prisma reports that as P1001 and the build dies. A deploy that happens to be
 * the first traffic in an hour, which describes most of ours, hits it.
 *
 * The tell is the timing: a genuinely unreachable host takes a connection
 * timeout to fail, while a waking Neon compute refuses in a few hundred
 * milliseconds. Waiting and asking again is the documented answer, and it
 * costs nothing when the database is already awake.
 *
 * Anything that isn't P1001 fails immediately. A migration that conflicts, or
 * credentials that are wrong, will not be fixed by asking five times.
 */
const ATTEMPTS = 5;
const BACKOFF_MS = [2000, 4000, 8000, 15000];

let result;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);

  if (result.status === 0) break;

  const unreachable = output.includes("P1001");
  if (!unreachable || attempt === ATTEMPTS) break;

  const wait = BACKOFF_MS[attempt - 1] ?? 15000;
  console.log(
    `[migrate] Database unreachable (P1001), likely a suspended Neon compute ` +
      `waking up. Attempt ${attempt} of ${ATTEMPTS}; retrying in ${wait / 1000}s.`,
  );
  // Synchronous on purpose: this runs as a build step, not in a server.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
}

process.exit(result.status ?? 1);
