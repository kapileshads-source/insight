"use client";

import { useState } from "react";

/**
 * The recovery key, shown once.
 *
 * "Once" is the whole design, not a limitation. If this could be fetched again
 * later then the server would have to hold something that opens the data, and
 * the entire privacy argument — that Insight cannot read a student's gradebook
 * — would be false. So the code lives in one React state variable, in one tab,
 * and when this screen closes it is gone.
 *
 * Which makes the job of this screen unusually specific: it has to get 25
 * characters out of the browser and onto something durable, in the ten seconds
 * before a teenager clicks past it. Hence three routes off the screen — copy,
 * download, or read it off the page — and a confirmation that cannot be
 * satisfied by clicking, only by typing part of the code back.
 *
 * The typed confirmation is the part that matters. Every "I have saved this"
 * checkbox in software is ticked by people who have not, because ticking is
 * cheaper than saving. Typing the last group back requires the code to
 * actually be somewhere the student is looking.
 */
export function RecoveryCodeScreen({
  code,
  onDone,
  heading = "Your recovery key",
  intro = "This is the only way back into your data if you forget your password. Save it now — we cannot show it again, and we do not have a copy.",
}: {
  code: string;
  onDone: () => void;
  heading?: string;
  intro?: string;
}) {
  const [typed, setTyped] = useState("");
  const [copied, setCopied] = useState(false);

  // The last group, which is what has to be typed back. Asking for the whole
  // 25 characters would get it pasted from the clipboard, which proves the
  // clipboard has it and nothing else.
  const lastGroup = code.split("-").at(-1) ?? "";
  const confirmed = typed.trim().toUpperCase() === lastGroup;

  function copy() {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  function download() {
    // Built and revoked here because the file has to contain something the
    // server has never seen, so it cannot be served from a route.
    const body = [
      "Insight recovery key",
      "",
      code,
      "",
      "This opens your encrypted Insight data if you forget your password.",
      "Anyone who has it can read your grades and study log, so keep it like a password.",
      `Issued ${new Date().toLocaleDateString()}.`,
      "",
      "Using it retires this key and gives you a new one.",
    ].join("\n");

    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "insight-recovery-key.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <h1 className="h1 text-[clamp(1.9rem,5vw,2.4rem)]">{heading}</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-text-muted">{intro}</p>

      {/* Set large, in the mono face, split the way it was generated. A student
          is going to copy this by hand onto paper, and five groups of five is
          the shape that survives that. */}
      <div className="mt-8 rounded-lg border border-accent/40 bg-accent-soft px-6 py-7">
        <p className="figure text-center text-[clamp(1.1rem,4.4vw,1.6rem)] leading-relaxed break-all text-text select-all">
          {code}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copy}
          className="btn-secondary px-5 py-2.5 text-[15px]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          onClick={download}
          className="btn-secondary px-5 py-2.5 text-[15px]"
        >
          Download as a file
        </button>
      </div>

      <p className="mt-6 text-[14px] leading-relaxed text-text-faint">
        Treat it like a password: anyone holding it can open your data. A photo
        in your camera roll is fine; a message to yourself in a group chat is
        not.
      </p>

      <div className="mt-8 border-t border-line pt-6">
        <label htmlFor="confirm-code" className="text-[15px] leading-relaxed">
          Type the last five characters back, so we know it&rsquo;s somewhere
          you can read it.
        </label>
        <input
          id="confirm-code"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={lastGroup.replace(/./g, "•")}
          className="figure mt-3 w-full rounded-md border border-line bg-bg px-4 py-3 text-[17px] tracking-[0.25em] uppercase"
        />

        <button
          type="button"
          disabled={!confirmed}
          onClick={onDone}
          className="btn-primary mt-6 px-7 py-3.5 text-[16px] disabled:opacity-50"
        >
          Saved it — continue
        </button>
      </div>
    </main>
  );
}
