"use client";

import { useState } from "react";
import {
  FOCUS_OFF_SHORTCUT,
  FOCUS_ON_SHORTCUT,
  shortcutUrl,
} from "@/lib/focus";

/**
 * Two buttons that run the student's own Focus shortcuts.
 *
 * This is the whole of what an iPhone allows. No app can set a Focus, and no
 * web page can do anything unprompted — so a session started on a laptop can
 * never reach into a phone and quiet it. A tap is the mechanism, and pretending
 * otherwise would just mean a feature that silently doesn't work.
 *
 * Shown only on iPhones. Elsewhere the link would open nothing and read as
 * broken.
 */
export function FocusShortcut() {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="mt-4 rounded-md border border-line bg-bg p-4">
      <p className="text-[15px]">
        Quiet your phone
        <span className="mt-0.5 block text-[14px] leading-relaxed text-text-faint">
          Runs a Focus you set up once, which hides distracting apps and
          silences their notifications.
        </span>
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={shortcutUrl(FOCUS_ON_SHORTCUT)}
          className="btn-secondary px-4 py-2 text-[14px] text-text"
        >
          Focus on
        </a>
        <a
          href={shortcutUrl(FOCUS_OFF_SHORTCUT)}
          className="btn-secondary px-4 py-2 text-[14px] text-text-muted"
        >
          Focus off
        </a>
        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          className="px-2 py-2 text-[14px] text-text-faint underline underline-offset-2"
        >
          {helpOpen ? "Hide setup" : "Set this up"}
        </button>
      </div>

      {helpOpen && (
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-[14px] leading-relaxed text-text-muted">
          <p>
            <span className="text-text">1.</span> In Settings → Focus, make one
            called anything you like — pick the apps you want hidden.
          </p>
          <p>
            <span className="text-text">2.</span> In the Shortcuts app, create a
            shortcut with the single action <strong>Set Focus</strong>, turning
            that Focus on. Name it exactly{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-[13px] text-text">
              {FOCUS_ON_SHORTCUT}
            </code>
            .
          </p>
          <p>
            <span className="text-text">3.</span> Make a second one that turns
            it off, named{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 text-[13px] text-text">
              {FOCUS_OFF_SHORTCUT}
            </code>
            .
          </p>
          <p className="text-text-faint">
            The names have to match exactly, or the buttons open Shortcuts and
            find nothing. iOS asks for permission the first time each one runs.
          </p>
        </div>
      )}
    </div>
  );
}
