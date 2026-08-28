import "server-only";

/**
 * Canvas REST API client.
 *
 * Two things from Instructure's docs shape this file.
 *
 * Canvas ids are 64-bit integers, and JavaScript loses precision above 2^53.
 * The `Accept: application/json+canvas-string-ids` header makes Canvas return
 * every id as a string instead, which is why ids are stored as strings all the
 * way through and why this header is never optional.
 *
 * Timestamps come back ISO 8601 in UTC. Everything schedule-related in Insight
 * runs in America/Chicago, so due dates are converted at the point of display
 * rather than assumed — "due Thursday" is wrong near midnight otherwise.
 */

export class CanvasAuthError extends Error {
  constructor() {
    super("Canvas rejected the token.");
    this.name = "CanvasAuthError";
  }
}

export class CanvasError extends Error {}

export type CanvasCourse = {
  id: string;
  name: string;
  course_code?: string;
};

export type CanvasAssignment = {
  id: string;
  name: string;
  due_at: string | null;
  /// When it became available, and when the teacher made it. Canvas sends both
  /// and we ignored both — they are the only signal it gives for work with no
  /// due date, which is otherwise a pile with no order to it.
  unlock_at?: string | null;
  created_at?: string | null;
  points_possible: number | null;
  course_id: string;
  submission?: {
    workflow_state?: string;
    score?: number | null;
    submitted_at?: string | null;
    late?: boolean;
    missing?: boolean;
  } | null;
};

type FetchOptions = { baseUrl: string; token: string };

/// Follows Canvas's Link header pagination rather than assuming one page.
/// A student with eight courses and a term of assignments will exceed the
/// default page size, and silently reading only the first page would look
/// exactly like "you have no assignments".
async function getAll<T>(
  { baseUrl, token }: FetchOptions,
  path: string,
): Promise<T[]> {
  let url: string | null = new URL(path, baseUrl).toString();
  const out: T[] = [];
  let pages = 0;

  while (url && pages < 20) {
    const res: Response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json+canvas-string-ids",
      },
      // Never cached: a stale grade is worse than a slow one.
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403) throw new CanvasAuthError();
    if (!res.ok) {
      throw new CanvasError(`Canvas returned ${res.status} for ${path}`);
    }

    out.push(...((await res.json()) as T[]));
    url = nextLink(res.headers.get("link"));
    pages++;
  }

  return out;
}

function nextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const [urlPart, relPart] = part.split(";");
    if (relPart?.includes('rel="next"')) {
      return urlPart.trim().replace(/^<|>$/g, "");
    }
  }
  return null;
}

/// Confirm a token works and return who it belongs to. Run at connect time so
/// a typo is caught immediately rather than surfacing as an empty dashboard
/// three days later.
export async function verifyToken(opts: FetchOptions): Promise<{ name: string }> {
  const res = await fetch(new URL("/api/v1/users/self", opts.baseUrl), {
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json+canvas-string-ids",
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) throw new CanvasAuthError();
  if (!res.ok) throw new CanvasError(`Canvas returned ${res.status}`);

  const user = (await res.json()) as { name?: string };
  return { name: user.name ?? "your account" };
}

export async function fetchCourses(opts: FetchOptions): Promise<CanvasCourse[]> {
  return getAll<CanvasCourse>(
    opts,
    "/api/v1/courses?enrollment_state=active&per_page=100",
  );
}

/// Assignments with the student's own submission attached, so grades and
/// submission state arrive in the same pass rather than needing a second
/// request per assignment.
export async function fetchAssignments(
  opts: FetchOptions,
  courseId: string,
): Promise<CanvasAssignment[]> {
  return getAll<CanvasAssignment>(
    opts,
    `/api/v1/courses/${courseId}/assignments?include[]=submission&per_page=100`,
  );
}

/// Map Canvas's submission shape onto our enum. Canvas distinguishes states
/// we don't need, and conflates a couple we do — `missing` and `late` are
/// flags rather than states, so they're checked before workflow_state.
export function submissionState(
  a: CanvasAssignment,
): "UNSUBMITTED" | "SUBMITTED" | "LATE" | "MISSING" | "GRADED" {
  const s = a.submission;
  if (!s) return "UNSUBMITTED";
  if (s.missing) return "MISSING";
  if (s.workflow_state === "graded") return "GRADED";
  if (s.late) return "LATE";
  if (s.submitted_at) return "SUBMITTED";
  return "UNSUBMITTED";
}

/// Modules with their items, so "what is this class on?" and "which
/// assignments are in it?" arrive together rather than one request per module.
///
/// Modules are optional in Canvas and plenty of teachers never make any, so a
/// failure here is not a failed sync — the caller treats it as "no answer".
export async function fetchModules(
  opts: FetchOptions,
  courseId: string,
): Promise<import("./modules").CanvasModule[]> {
  return getAll<import("./modules").CanvasModule>(
    opts,
    `/api/v1/courses/${courseId}/modules?include[]=items&per_page=50`,
  );
}
