/**
 * Which unit a class is actually on.
 *
 * The one question only Canvas can answer — HAC's gradebook has names, dates
 * and scores but nothing about what is being taught. Modules are where a
 * teacher writes "Unit 3: Stoichiometry", and reading them turns a dashboard
 * that lists work into one that can say what the week is about.
 *
 * It earns its place twice. On screen it is a sentence a student recognises,
 * and underneath it is the best available answer to "is this undated
 * assignment current?" — work sitting in the module the class is on now
 * almost certainly is, which no date on the row could have told us.
 *
 * Pure, so the choosing is testable without a Canvas token.
 */

export type CanvasModuleItem = {
  /// Present on items of type "Assignment"; absent on pages, files and quizzes
  /// that aren't graded work.
  content_id?: string | null;
  type?: string;
};

export type CanvasModule = {
  id: string;
  name: string;
  position?: number | null;
  /// Canvas's own view of where the student is: "locked", "unlocked",
  /// "started", or "completed".
  state?: string | null;
  unlock_at?: string | null;
  items?: CanvasModuleItem[] | null;
};

export type CurrentModule = {
  name: string;
  /// Canvas ids of the assignments inside it, used to mark undated work as
  /// current.
  assignmentIds: string[];
};

/**
 * The module a class is on now.
 *
 * Preference order, and each step is a fallback rather than a guess:
 *
 * 1. One Canvas says is `started` — the student has opened something in it,
 *    which is the strongest signal available.
 * 2. Otherwise the first `unlocked` one that isn't finished. Teachers unlock
 *    modules as the term moves, so the earliest open-but-unfinished one is
 *    where the class is.
 * 3. Otherwise nothing. A course where everything is locked or everything is
 *    complete has no current unit, and saying so is better than naming one.
 *
 * Modules with no name are skipped: Canvas allows them and they read as blank
 * lines on the dashboard.
 */
export function currentModule(modules: CanvasModule[]): CurrentModule | null {
  const named = modules.filter((m) => m.name?.trim());
  if (named.length === 0) return null;

  const ordered = [...named].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  );

  const started = ordered.find((m) => m.state === "started");
  const open = ordered.find(
    (m) => m.state === "unlocked" || m.state === null || m.state === undefined,
  );

  const chosen = started ?? open ?? null;
  if (!chosen) return null;

  return {
    name: chosen.name.trim(),
    assignmentIds: (chosen.items ?? [])
      .filter((i) => i.type === "Assignment" && i.content_id)
      .map((i) => String(i.content_id)),
  };
}
