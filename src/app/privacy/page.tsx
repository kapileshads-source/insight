import Link from "next/link";
import { PageHero, SiteFooter, SiteNav } from "@/components/chrome";

export const metadata = { title: "Privacy — Insight" };

/// Plain language on purpose. COPPA requires that a parent can actually
/// understand this, and so should a twelve-year-old. Every claim here is
/// one the architecture actually makes true — nothing is aspirational.
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12 border-t border-line pt-8">
      <h2 className="h2 text-[clamp(1.4rem,3.5vw,1.75rem)]">{title}</h2>
      <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-text-muted">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="flex-1">
      <SiteNav />

      <PageHero
        eyebrow="Privacy"
        title="What we do with your data."
        lede="Insight is built by Kapilesh Rajaravisankar and Sahas Raghav Vijayakumar for students in Frisco ISD. It is not run by, endorsed by, or affiliated with the district."
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="mt-4 text-[15px] text-text-faint">
        Parents: there&rsquo;s a{" "}
        <Link
          href="/privacy/parents"
          className="text-accent underline underline-offset-2"
        >
          shorter version written for you
        </Link>
        .
      </p>

      <Section title="Most of it, we can't read">
        <p>
          Your study sessions, sleep, screen time and grades are encrypted on
          your own device before they&rsquo;re sent to us. The key comes from
          your password, and your password never leaves your browser.
        </p>
        <p>
          This is not a promise about how carefully we behave. It&rsquo;s a
          fact about how the system is built: we hold scrambled data and no way
          to unscramble it.
        </p>
        <p className="text-text">
          You can test this. Forget your password and your data is unreadable —
          including to us. If we could recover it for you, this page would be a
          lie.
        </p>
        <p>
          Which is why you get a recovery key when you set your password: a
          25-character code, generated in your browser, shown once, and never
          sent to us. It opens a second copy of the same key. If you forget your
          password, that code is the way back in — and if you lose the code as
          well, there is genuinely nothing anyone can do, because we never had
          either one. You can issue a new key from settings at any time, which
          retires the old one.
        </p>
        <p>
          One honest caveat on that, if you sign in to Home Access Center with
          your password rather than the extension: what we already stored stays
          unreadable, but we would still be able to fetch a fresh copy of your
          gradebook, because signing in doesn&rsquo;t need your Insight
          password. That option is explained below, and disconnecting it ends
          that.
        </p>
      </Section>

      <Section title="What we can see">
        <p>Being honest about the limits, because there are some:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>That your account exists, and your email address</li>
          <li>Which campus and grade you picked</li>
          <li>Your date of birth</li>
          <li>
            How many entries you have and when you wrote them — not what any of
            them say
          </li>
          <li>
            Which assignments you&rsquo;ve ticked off as done, and when — not
            what they are
          </li>
        </ul>
        <p>
          That last one is new, and it is there so the evening reminder
          doesn&rsquo;t tell you three things are due after you&rsquo;ve just
          finished them.
        </p>
        <p>Three real exceptions, and this is the honest part of the page.</p>
        <p>
          <strong className="text-text">Canvas.</strong>{" "}
          If you connect it, we
          hold your Canvas access token in a form our server can read, because
          our server has to call Canvas for you. Disconnect Canvas at any time
          and it&rsquo;s deleted.
        </p>
        <p>
          <strong className="text-text">
            Home Access Center, if you sign in with your password.
          </strong>{" "}
          There are two ways to bring your HAC grades in. The browser extension
          uses the login you already have in that browser and never sees a
          password — it is the better option, and it only works on a computer.
          The other way is to give us your HAC username and password so we can
          sign in for you, which is what makes this work on a phone.
        </p>
        <p className="text-text">
          If you choose that second way, we store your HAC password in a form
          our server can read, and that means{" "}
          <strong>we can open your gradebook.</strong> It is the only part of
          Insight where that is true, and we are not going to bury it: your
          study sessions, sleep and everything else stay encrypted with a key we
          do not have, but your HAC gradebook does not.
        </p>
        <p>
          What we do with it: sign in, fetch the classwork page, and hand it
          straight to your browser, which reads it and encrypts it before
          anything is stored. Your password is never put in a web address and
          never written into a log or an error message, nothing is saved unless
          the sign-in actually works, and disconnecting deletes it outright
          rather than leaving an empty row behind.
        </p>
        <p>
          If your HAC password is the same as your school email password —
          which for a lot of people it is — change one of them before you use
          this. Or use the extension, which never asks.
        </p>
        <p>
          <strong className="text-text">
            What the extension and the desktop apps send.
          </strong>{" "}
          None of them can encrypt anything, because encrypting needs your
          password and we never give it to them — deliberately, since something
          running on your laptop all day is the last place that key should live.
          So while a session is running they send us plain site and app names,
          and those sit in a holding area our server <em>can</em> read until the
          next time you open Insight. At that point your browser encrypts them
          and deletes the readable copy. Anything nobody collects expires after six
          hours and is swept away — whenever a device next reports, and once a
          day regardless.
        </p>
        <p className="text-text">
          Which means: for a few hours, we can see that you had YouTube open for
          twenty minutes during a session on Tuesday. Not what you watched, not
          which video, and nothing at all from outside a session — but that much,
          yes. It&rsquo;s the one place this design leaks, and you should hear it
          from us rather than find it.
        </p>
      </Section>

      <Section title="What we never collect">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Your location. Choosing &ldquo;Library&rdquo; records the word
            &ldquo;Library&rdquo; and nothing else. No GPS, ever.
          </li>
          <li>
            Your browsing outside a study session. The extension records site
            names only while a session is running, and nothing when one
            isn&rsquo;t.
          </li>
          <li>
            What&rsquo;s on your screen. The desktop app records how long an
            app was in front, not what you typed or read.
          </li>
          <li>
            Your screen time screenshot. It&rsquo;s read on your device and
            never uploaded — only the number, after you confirm it.
          </li>
        </ul>
      </Section>

      <Section title="The recommendation feature">
        <p>
          Once a pattern has enough data behind it, Insight can send a short
          summary to Groq, an outside AI service, to phrase it as a sentence of
          advice.
        </p>
        <p>
          What goes: the finished pattern, and the names and dates of upcoming
          assignments. What doesn&rsquo;t: your name, your email, your school,
          your grades, your sleep, or any individual session. You can turn it
          off, and it never runs until you have a real pattern.
        </p>
      </Section>

      <Section title="You have to be 13">
        <p>
          We ask everyone&rsquo;s birth date, and that is the only thing it is
          used for. Under 13 and the answer is no — the account stops there and
          nothing else is collected.
        </p>
        <p>
          That&rsquo;s a rule about privacy law rather than about you.
          Collecting anything from someone under 13 needs a parent&rsquo;s
          verified permission, and doing that properly — reaching a real parent
          in a real inbox, every time — is more than this project can promise
          today. We&rsquo;d rather say no than half-do it.
        </p>
        <p>
          A parent of any student can still see everything we hold, have it
          deleted, or close the account.
        </p>
      </Section>

      <Section title="Your choices">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Export everything as a file</li>
          <li>Delete single entries, or the whole account</li>
          <li>
            Disconnect Canvas, remove the extension, or uninstall the app,
            each on its own
          </li>
          <li>Mute any category of insight you find stressful</li>
        </ul>
      </Section>

      <Section title="How long we keep it">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>While your account is open, we keep it</li>
          <li>Delete your account and it&rsquo;s erased within 30 days, backups within 90</li>
          <li>
            We don&rsquo;t delete dormant accounts on a timer. If you graduate
            or leave, delete the account yourself and it goes — we&rsquo;d
            rather not promise a sweep we haven&rsquo;t built.
          </li>
        </ul>
      </Section>

      <Section title="School records">
        <p>
          Insight receives nothing from Frisco ISD. Anything from Canvas comes
          through your own account, because you authorised it. Your school
          can&rsquo;t see your Insight data, and FERPA — the law covering
          school-held records — doesn&rsquo;t apply here, because the school
          isn&rsquo;t giving us anything.
        </p>
      </Section>

      <Section title="Who else touches it">
        <p>
          Only services that run parts of Insight: hosting and database, sign-in
          (Clerk), email delivery (Resend), and the AI service above. None may
          use your data for their own purposes. We don&rsquo;t sell anything, we
          don&rsquo;t advertise, and we don&rsquo;t train AI models on your data.
        </p>
      </Section>

      <Section title="Questions">
        <p>
          Write to{" "}
          <a
            href="mailto:kapilesh.rajaravi@gmail.com"
            className="text-accent underline underline-offset-2"
          >
            kapilesh.rajaravi@gmail.com
          </a>
          . If we change this page in a way that matters, we&rsquo;ll email you
          first, and anyone under 13 will need a parent to consent again.
        </p>
      </Section>
      </div>

      <SiteFooter />
    </main>
  );
}
