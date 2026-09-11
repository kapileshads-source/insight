"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which is what makes Insight installable.
 *
 * Only in production. In development a worker sits between the browser and
 * the dev server, and the failure mode is edits that appear not to apply,
 * an afternoon lost to a cached page that looks like a bug in your code.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // After load, so registration never competes with the first render.
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // An install prompt is a nicety. If it fails, the site works exactly
        // as it did before, and nothing should be said about it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
