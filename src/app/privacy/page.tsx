import Link from "next/link";

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
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <Link href="/" className="h3 text-[17px]">
        Insight
      </Link>

      <h1 className="h1 mt-10 text-[clamp(2.25rem,6vw,3rem)]">
        What we do with your data.
      </h1>
      <p className="mt-5 text-[17px] leading-relaxed text-text-muted">
        Insight is built by Kapilesh Rajaravisankar and Sahas Raghav
        Vijayakumar for students in Frisco ISD. It is not run by, endorsed by,
        or affiliated with the district.
      </p>
      <p className="mt-4 text-[15px] text-text-faint">
        Parents: there&rsquo;s a{" "}
        <Link
          href="/privacy/parents"
          className="text-sky underline underline-offset-2"
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
          You can test this. Forget your password and your data becomes
          permanently unreadable — including to us. If we could recover it for
          you, this page would be a lie.
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
        </ul>
        <p>Two real exceptions, and this is the honest part of the page.</p>
        <p>
          <strong className="text-text">Canvas.</strong>{" "}
          If you connect it, we
          hold your Canvas access token in a form our server can read, because
          our server has to call Canvas for you. Disconnect Canvas at any time
          and it&rsquo;s deleted.
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
            Don&rsquo;t use Insight for 18 months and we email you, then delete
            it 30 days later. That covers graduating or leaving FISD — you
            don&rsquo;t have to do anything.
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
            className="text-sky underline underline-offset-2"
          >
            kapilesh.rajaravi@gmail.com
          </a>
          . If we change this page in a way that matters, we&rsquo;ll email you
          first, and anyone under 13 will need a parent to consent again.
        </p>
      </Section>
    </main>
  );
}
