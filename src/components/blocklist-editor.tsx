"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BLOCK_CATEGORIES, ALL_CATEGORIES, normalizeSite } from "@/lib/blocklist";
import {
  saveBlocklistPrefs,
  type BlocklistPrefs,
} from "@/app/actions/settings";

const FIELD =
  "w-full rounded-md border border-line-hi bg-bg px-4 py-3 text-[16px] text-text focus:border-sky";

export function BlocklistEditor({ prefs }: { prefs: BlocklistPrefs }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [categories, setCategories] = useState<string[]>(prefs.categories);
  const [extra, setExtra] = useState<string[]>(prefs.extra);
  const [allowed, setAllowed] = useState<string[]>(prefs.allowed);
  const [newExtra, setNewExtra] = useState("");
  const [newAllowed, setNewAllowed] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function persist(next: {
    categories?: string[];
    extra?: string[];
    allowed?: string[];
  }) {
    setError(null);
    setNote(null);
    start(async () => {
      const res = await saveBlocklistPrefs({
        categories: next.categories ?? categories,
        extra: next.extra ?? extra,
        allowed: next.allowed ?? allowed,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNote("Saved. Takes effect on your laptop within a minute.");
      router.refresh();
    });
  }

  function toggleCategory(id: string) {
    const next = categories.includes(id)
      ? categories.filter((c) => c !== id)
      : [...categories, id];
    setCategories(next);
    persist({ categories: next });
  }

  function addSite(
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    key: "extra" | "allowed",
    clear: () => void,
  ) {
    const site = normalizeSite(value);
    if (!site) {
      setError("That doesn't look like a website address.");
      return;
    }
    if (list.includes(site)) {
      clear();
      return;
    }
    const next = [...list, site];
    setList(next);
    clear();
    persist({ [key]: next });
  }

  function removeSite(
    site: string,
    list: string[],
    setList: (v: string[]) => void,
    key: "extra" | "allowed",
  ) {
    const next = list.filter((s) => s !== site);
    setList(next);
    persist({ [key]: next });
  }

  const blockedCount = categories.reduce(
    (n, c) =>
      n +
      (ALL_CATEGORIES.includes(c as never)
        ? BLOCK_CATEGORIES[c as keyof typeof BLOCK_CATEGORIES].sites.length
        : 0),
    extra.length,
  );

  return (
    <section className="rounded-lg border border-line bg-surface p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="h3 text-[17px]">What Focus Mode blocks</h2>
        <span className="label text-text-faint">
          {Math.max(0, blockedCount - allowed.length)} sites
        </span>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
        Only while a session is running. Search, Google Docs, Wikipedia and
        Canvas are never blocked.
      </p>

      <div className="mt-5 space-y-2">
        {ALL_CATEGORIES.map((id) => {
          const cat = BLOCK_CATEGORIES[id];
          const on = categories.includes(id);
          return (
            <label
              key={id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-bg p-3.5"
            >
              <input
                type="checkbox"
                checked={on}
                disabled={pending}
                onChange={() => toggleCategory(id)}
                className="mt-1 h-4 w-4 accent-[color:var(--sky)]"
              />
              <span className="min-w-0">
                <span className="text-[15px]">{cat.label}</span>
                <span className="mt-0.5 block text-[14px] leading-relaxed text-text-faint">
                  {cat.description} {cat.sites.length} sites.
                </span>
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="add-block" className="label text-text-muted">
          Block something else
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="add-block"
            value={newExtra}
            onChange={(e) => setNewExtra(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSite(newExtra, extra, setExtra, "extra", () =>
                  setNewExtra(""),
                );
              }
            }}
            placeholder="pinterest.com"
            className={FIELD}
          />
          <button
            onClick={() =>
              addSite(newExtra, extra, setExtra, "extra", () => setNewExtra(""))
            }
            disabled={pending}
            className="btn-secondary shrink-0 px-5 text-[15px] text-text-muted"
          >
            Add
          </button>
        </div>
        {extra.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {extra.map((s) => (
              <button
                key={s}
                onClick={() => removeSite(s, extra, setExtra, "extra")}
                disabled={pending}
                className="rounded-full border border-line-hi px-3 py-1.5 text-[14px] text-text-muted"
              >
                {s} &times;
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <label htmlFor="add-allow" className="label text-text-muted">
          Always allow
        </label>
        <p className="mt-1 text-[14px] leading-relaxed text-text-faint">
          For anything on a list above that you genuinely need — a YouTube
          channel your teacher sets, say. Exceptions beat everything else.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            id="add-allow"
            value={newAllowed}
            onChange={(e) => setNewAllowed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSite(newAllowed, allowed, setAllowed, "allowed", () =>
                  setNewAllowed(""),
                );
              }
            }}
            placeholder="youtube.com"
            className={FIELD}
          />
          <button
            onClick={() =>
              addSite(newAllowed, allowed, setAllowed, "allowed", () =>
                setNewAllowed(""),
              )
            }
            disabled={pending}
            className="btn-secondary shrink-0 px-5 text-[15px] text-text-muted"
          >
            Allow
          </button>
        </div>
        {allowed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {allowed.map((s) => (
              <button
                key={s}
                onClick={() => removeSite(s, allowed, setAllowed, "allowed")}
                disabled={pending}
                className="rounded-full border border-up/40 bg-up/10 px-3 py-1.5 text-[14px] text-up"
              >
                {s} &times;
              </button>
            ))}
          </div>
        )}
      </div>

      {note && <p className="mt-4 text-[15px] text-up">{note}</p>}
      {error && (
        <p role="alert" className="mt-4 text-[15px] text-down">
          {error}
        </p>
      )}
    </section>
  );
}
