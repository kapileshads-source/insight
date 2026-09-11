import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Shared plumbing for the endpoints a paired device talks to.
 *
 * Extensions and native apps call from an origin that can't be allowlisted,
 * `chrome-extension://` ids are unpredictable, and a phone has no origin at
 * all. That's acceptable here because every one of these authenticates a
 * bearer token rather than a cookie: there is no ambient authority for a
 * hostile page to borrow.
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: CORS });
}

export function ok(body: Record<string, unknown>) {
  return NextResponse.json(body, { headers: CORS });
}

export const sealedSchema = z.object({
  cipher: z.string().min(1).max(20_000),
  iv: z.string().min(1).max(256),
});

/// Reads a JSON body without letting a malformed one become a 500.
export async function readJson(request: Request): Promise<unknown | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
