import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed Middleware to Proxy. Same mechanism, same position in the
// request lifecycle — the file is just called `proxy.ts` now, and there can
// only be one per project.

/// Everything a signed-out visitor is allowed to reach. The intro page has to
/// be public, since its whole job is explaining the app to someone who hasn't
/// signed up. Parent consent is public because the person clicking that link
/// is a parent who has no account and never will.
const isPublic = createRouteMatcher([
  "/",
  "/privacy",
  "/privacy/parents",
  // Someone sent this link by a friend should be able to read it before
  // deciding whether to sign up.
  "/download",
  // Opened by a Shortcuts automation the instant a student opens something
  // they meant to avoid. Requiring a sign-in first would defeat the point —
  // and a signed-in reader still gets their session details.
  "/bounce",
  // Cached on the device and shown when the network is gone.
  "/offline",
  // Setup instructions, which are most useful to someone deciding whether
  // Insight is worth signing up for on the phone they actually own.
  "/iphone",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/consent(.*)",
  "/api/consent(.*)",
  "/api/devices(.*)",
  // Authenticates with a shared secret rather than a session, since the
  // caller is a scheduler with no user attached.
  "/api/cron",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) {
    // The redirect target is stated here rather than left to
    // NEXT_PUBLIC_CLERK_SIGN_IN_URL. With no explicit URL and that variable
    // unset, `protect()` has nowhere to send a signed-out visitor and answers
    // **404** — which is what production did to every protected route,
    // including the landing page's own "Open the dashboard" button, while
    // local development redirected correctly because the variable is in
    // `.env`. A missing environment variable should not be able to turn the
    // front door into a dead link.
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless they appear
    // in a search param.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
