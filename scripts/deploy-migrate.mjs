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
  console.log("[migrate] No DATABASE_URL set — skipping.");
  process.exit(0);
}

if (!process.env.DIRECT_DATABASE_URL && /-pooler\./.test(url)) {
  console.warn(
    "[migrate] Using a pooled connection. If this fails, set DIRECT_DATABASE_URL " +
      "to Neon's direct (non-pooler) string — migrations need session mode.",
  );
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

process.exit(result.status ?? 1);
