"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrypto } from "@/components/crypto-provider";
import {
  checkPassword,
  UnsupportedBrowserError,
  createEncryptionSetup,
} from "@/lib/crypto";
import type { ActionResult } from "@/app/onboarding/actions";
import {
  requestParentConsent,
  saveBirthDate,
  saveDevices,
  saveEncryptionSetup,
  saveSchool,
} from "@/app/onboarding/actions";

const STEP_ORDER = ["BIRTHDATE", "PASSWORD", "SCHOOL", "DEVICES"] as const;

export function OnboardingShell({
  step,
  title,
  intro,
  children,
}: {
  step: (typeof STEP_ORDER)[number] | "AWAITING_CONSENT";
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  const index = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
      {index >= 0 && (
        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of 4`}>
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                i <= index ? "bg-sky" : "bg-surface-hi"
              }`}
            />
          ))}
        </div>
      )}

      <h1 className="h1 mt-8 text-[clamp(2rem,5vw,2.75rem)]">{title}</h1>
      {intro && (
        <p className="mt-4 text-[17px] leading-relaxed text-text-muted">
          {intro}
        </p>
      )}
      <div className="mt-9">{children}</div>
    </main>
  );
}

function ErrorNote({ result }: { result: ActionResult | null }) {
  if (!result || result.ok) return null;
  return (
    <p role="alert" className="mt-4 text-[15px] text-down">
      {result.error}
    </p>
  );
}

const FIELD =
  "w-full rounded-md border border-line-hi bg-surface px-4 py-3 text-[16px] text-text focus:border-sky";

// --- 1. birthdate -----------------------------------------------------------

export function BirthDateStep() {
  const [result, action, pending] = useActionState(saveBirthDate, null);

  return (
    <OnboardingShell
      step="BIRTHDATE"
      title="When were you born?"
      intro="This decides one thing only: whether we need a parent's permission before collecting anything. Under 13 and the law requires it."
    >
      <form action={action}>
        <label htmlFor="birthDate" className="label text-text-muted">
          Date of birth
        </label>
        <input
          id="birthDate"
          name="birthDate"
          type="date"
          required
          className={`${FIELD} mt-2`}
        />
        <ErrorNote result={result} />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-60"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}

// --- 2. parent consent ------------------------------------------------------

export function ParentConsentStep({ sentTo }: { sentTo?: string | null }) {
  const [result, action, pending] = useActionState(requestParentConsent, null);
  const sent = sentTo && (result?.ok || true);

  return (
    <OnboardingShell
      step="AWAITING_CONSENT"
      title={sent ? "Waiting on your parent." : "We need a parent first."}
      intro={
        sent
          ? `We emailed ${sentTo}. Nothing about you gets collected until they click the link — this page will move on by itself once they do.`
          : "Because you're under 13, a parent or guardian has to say yes before we collect anything at all. Give us their email and we'll ask them."
      }
    >
      <form action={action}>
        <label htmlFor="parentEmail" className="label text-text-muted">
          Parent or guardian&rsquo;s email
        </label>
        <input
          id="parentEmail"
          name="parentEmail"
          type="email"
          required
          defaultValue={sentTo ?? ""}
          placeholder="name@example.com"
          className={`${FIELD} mt-2`}
        />
        <ErrorNote result={result} />
        <button
          type="submit"
          disabled={pending}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-60"
        >
          {pending ? "Sending…" : sent ? "Send it again" : "Ask them"}
        </button>
      </form>
    </OnboardingShell>
  );
}

// --- 3. password ----------------------------------------------------------

export function PasswordStep() {
  const router = useRouter();
  const { adopt } = useCrypto();
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = value ? checkPassword(value) : null;
  const matches = value.length > 0 && value === confirm;
  const ready = Boolean(check?.ok) && matches && acknowledged;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        // Key generation happens here, in the browser. The password itself
        // never crosses the network.
        const { setup, dek } = await createEncryptionSetup(value);
        const res = await saveEncryptionSetup(setup);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        // Hand the key straight to the session. Without this the student
        // reaches the dashboard and is immediately asked for the password
        // they set ten seconds ago.
        await adopt(dek, false);
        router.refresh();
      } catch (e) {
        // An unsupported browser is not a retryable error, and telling a
        // student to "try again" would have them retype a correct password
        // until they give up.
        setError(
          e instanceof UnsupportedBrowserError
            ? e.message
            : "Something went wrong setting up encryption. Try again.",
        );
      }
    });
  }

  return (
    <OnboardingShell
      step="PASSWORD"
      title="Pick a password."
      intro="Your sleep, your sessions and your grades get encrypted on this device before they're sent anywhere. This password is the only thing that opens them."
    >
      <form onSubmit={submit}>
        <label htmlFor="password" className="label text-text-muted">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="four random words work well"
          className={`${FIELD} mt-2`}
        />
        {check && (
          <p
            className={`mt-2 text-[14px] ${
              check.score >= 2
                ? "text-up"
                : check.ok
                  ? "text-text-muted"
                  : "text-down"
            }`}
          >
            {check.message}
          </p>
        )}

        <label htmlFor="confirm" className="label mt-6 block text-text-muted">
          Type it again
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={`${FIELD} mt-2`}
        />
        {confirm.length > 0 && !matches && (
          <p className="mt-2 text-[14px] text-down">
            These don&rsquo;t match yet.
          </p>
        )}

        {/* Deliberately blunt and deliberately unskippable. This is the one
            irreversible thing in the whole product. */}
        <div className="mt-7 rounded-md border border-down/40 bg-down/10 p-4">
          <p className="text-[15px] leading-relaxed">
            If you forget this, your data is gone. Not &ldquo;email support and
            we&rsquo;ll sort it out&rdquo; — actually gone. We never receive it,
            so there is nothing on our end to reset. Write it down somewhere
            real.
          </p>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[15px]">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[color:var(--sky)]"
            />
            <span>I&rsquo;ve saved it somewhere I won&rsquo;t lose it.</span>
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-[15px] text-down">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready || pending}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-50"
        >
          {pending ? "Setting up…" : "Continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}

// --- 4. school --------------------------------------------------------------

export type SchoolOption = { id: string; name: string; type: "HIGH" | "MIDDLE" };

export function SchoolStep({ schools }: { schools: SchoolOption[] }) {
  const [result, action, pending] = useActionState(saveSchool, null);
  const [schoolId, setSchoolId] = useState("");

  const selected = schools.find((s) => s.id === schoolId);
  const grades = !selected
    ? []
    : selected.type === "HIGH"
      ? [9, 10, 11, 12]
      : [6, 7, 8];

  return (
    <OnboardingShell
      step="SCHOOL"
      title="Which campus?"
      intro="This sets your bell schedule, so the app knows what period it is without asking you."
    >
      <form action={action}>
        <label htmlFor="schoolId" className="label text-text-muted">
          School
        </label>
        <select
          id="schoolId"
          name="schoolId"
          required
          value={schoolId}
          onChange={(e) => setSchoolId(e.target.value)}
          className={`${FIELD} mt-2`}
        >
          <option value="">Choose your campus</option>
          <optgroup label="High schools">
            {schools
              .filter((s) => s.type === "HIGH")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Middle schools">
            {schools
              .filter((s) => s.type === "MIDDLE")
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </optgroup>
        </select>

        {selected && (
          <>
            <span className="label mt-6 block text-text-muted">Grade</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {grades.map((g) => (
                <label key={g} className="cursor-pointer">
                  <input
                    type="radio"
                    name="gradeLevel"
                    value={g}
                    required
                    className="peer sr-only"
                  />
                  <span className="block rounded-md border border-line-hi px-5 py-2.5 text-[15px] peer-checked:border-sky peer-checked:bg-sky peer-checked:text-on-light">
                    {g}
                  </span>
                </label>
              ))}
            </div>
            {selected.type === "HIGH" && (
              <p className="mt-4 text-[14px] leading-relaxed text-text-faint">
                Your campus runs A/B block days. Insight already knows which is
                which for every date this year.
              </p>
            )}
          </>
        )}

        <ErrorNote result={result} />
        <button
          type="submit"
          disabled={pending || !selected}
          className="btn-primary mt-7 px-7 py-3.5 text-[16px] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
      </form>
    </OnboardingShell>
  );
}

// --- 5. devices -------------------------------------------------------------

function ChoiceGroup({
  name,
  legend,
  options,
  note,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  note?: string;
}) {
  return (
    <fieldset>
      <legend className="label text-text-muted">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              required
              className="peer sr-only"
            />
            <span className="block rounded-md border border-line-hi px-5 py-2.5 text-[15px] peer-checked:border-sky peer-checked:bg-sky peer-checked:text-on-light">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {note && (
        <p className="mt-2 text-[14px] leading-relaxed text-text-faint">
          {note}
        </p>
      )}
    </fieldset>
  );
}

export function DevicesStep() {
  const [result, action, pending] = useActionState(saveDevices, null);

  return (
    <OnboardingShell
      step="DEVICES"
      title="What do you use?"
      intro="So we offer you the right downloads later, and don't nag you about an app that doesn't exist for your phone."
    >
      <form action={action} className="space-y-8">
        <ChoiceGroup
          name="laptopOs"
          legend="Laptop"
          options={[
            { value: "WINDOWS", label: "Windows" },
            { value: "MACOS", label: "Mac" },
            { value: "CHROMEOS", label: "Chromebook" },
            { value: "NONE", label: "None" },
          ]}
        />
        <ChoiceGroup
          name="phoneOs"
          legend="Phone"
          options={[
            { value: "IOS", label: "iPhone" },
            { value: "ANDROID", label: "Android" },
            { value: "NONE", label: "None" },
          ]}
          note="On iPhone, screen time comes from a screenshot you upload — Apple doesn't allow an app to read it. Android can do it automatically."
        />

        <div>
          <ErrorNote result={result} />
          <button
            type="submit"
            disabled={pending}
            className="btn-primary px-7 py-3.5 text-[16px] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Finish"}
          </button>
        </div>
      </form>
    </OnboardingShell>
  );
}
