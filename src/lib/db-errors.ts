import "server-only";

/**
 * Making database failures legible in production logs.
 *
 * Next.js strips error messages from production builds so they can't leak, and
 * a hosting log list truncates what's left. The result is a wall of
 * "PrismaClientKnownRequestError" with the one useful part — the code — cut
 * off. This puts the code at the front of the line, where it survives.
 */

type PrismaLike = {
  code?: string;
  meta?: Record<string, unknown>;
  message?: string;
};

/// What each code means for us, so a log line explains itself rather than
/// needing a lookup.
const MEANINGS: Record<string, string> = {
  P2002: "unique constraint violated",
  P2003: "foreign key constraint violated",
  P2021: "table does not exist — migrations not applied to this database",
  P2022: "column does not exist — schema is behind the code",
  P2025: "record not found",
};

export function prismaCode(e: unknown): string | null {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as PrismaLike).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/// Log a failure with its code first, then rethrow untouched.
///
/// Rethrowing matters: swallowing the error here would turn a broken query
/// into a page that silently renders wrong, which is harder to notice and
/// much harder to diagnose than a visible failure.
export function logDbError(operation: string, e: unknown): never {
  const code = prismaCode(e);
  const meta =
    typeof e === "object" && e !== null && "meta" in e
      ? JSON.stringify((e as PrismaLike).meta)
      : "";

  console.error(
    `[insight] db-error op=${operation} code=${code ?? "none"} ${
      code && MEANINGS[code] ? `(${MEANINGS[code]})` : ""
    } ${meta}`.trim(),
  );

  throw e;
}

/// Wrap an async database call so any failure is labelled before it escapes.
export async function traced<T>(
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    logDbError(operation, e);
  }
}
