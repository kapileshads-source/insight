import type { MetadataRoute } from "next";

/**
 * What makes Insight installable to a home screen.
 *
 * The point isn't polish. Students are on their own phones, the native iOS app
 * expires after seven days without a paid developer account, and the Chrome
 * Web Store is a $5 wall in front of the extension. An installable web app has
 * none of that: it costs nothing, updates the moment we deploy, and works the
 * same on Android.
 *
 * `standalone` matters more than it looks. Without it, the bounce screen opens
 * in a Safari tab with a URL bar, which reads as a website telling you off
 * rather than as part of the thing you signed up for.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Insight",
    short_name: "Insight",
    description:
      "Track how you study and what you score, and see where the two line up.",
    // Straight to the dashboard, not the marketing page. Someone who installed
    // this has already decided.
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e0f11",
    theme_color: "#0e0f11",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Android crops icons to whatever shape the launcher wants, so this
        // one is drawn with a safe zone around it.
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
