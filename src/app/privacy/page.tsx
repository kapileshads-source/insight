import Link from "next/link";
import { PageHero, SiteFooter, SiteNav } from "@/components/chrome";

export const metadata = { title: "Privacy, Insight" };

/// Plain language on purpose. COPPA requires that a parent can actually
/// understand this, and so should a twelve-year-old. Every claim here is
/// one the architecture actually makes true, nothing is aspirational.
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

      <p className="mt-2 text-[15px] text-text-faint">
        Last updated 10 September 2026.
      </p>

      <Section title="Data we cannot read">
        <p>
          Your study sessions, sleep records, screen time and grades are
          encrypted on your own device before they are transmitted to us. The
          encryption key is derived from your password, and your password never
          leaves your browser.
        </p>
        <p>
          This is a property of the system rather than a policy commitment. We
          hold encrypted data and possess no means of decrypting it.
        </p>
        <p className="text-text">
          This is verifiable. If you forget your password, your data becomes
          unreadable to you and to us alike. Were we able to recover it on your
          behalf, this statement would be false.
        </p>
        <p>
          For that reason, a recovery key is issued when you set your password.
          It is a 25 character code, generated in your browser, displayed once,
          and never transmitted to us. It unlocks a second copy of the same
          encryption key. If you forget your password, that code is the only way
          to regain access, and if you lose the code as well, no party can
          restore your data, because we never held either credential. You may
          issue a replacement key at any time from Settings, which invalidates
          the previous one.
        </p>
        <p>
          One qualification applies if you sign in to Home Access Center using
          your password rather than the browser extension. Data already stored
          remains unreadable to us, but we would retain the ability to retrieve
          a fresh copy of your gradebook, because signing in to Home Access
          Center does not require your Insight password. This is described in
          full below, and disconnecting the integration ends it.
        </p>
      </Section>

      <Section title="Data we can see">
        <p>The following are visible to us:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>That your account exists, and your email address</li>
          <li>The campus and grade level you selected</li>
          <li>Your date of birth</li>
          <li>
            How many entries you have created and when, but not their contents
          </li>
          <li>
            Which assignments you have marked as complete and when, but not what
            those assignments are
          </li>
        </ul>
        <p>
          The last of these exists so that evening reminders do not list work
          you have already finished.
        </p>
        <p>There are three exceptions, described in full below.</p>
        <p>
          <strong className="text-text">Canvas.</strong> If you connect Canvas,
          we store your Canvas access token in a form our server can read,
          because our server must call Canvas on your behalf. Disconnecting
          Canvas deletes it.
        </p>
        <p>
          <strong className="text-text">Home Access Center.</strong> Retrieving
          your official grades requires your Home Access Center username and
          password so that we can sign in on your behalf. A second method
          previously existed, in which the browser extension read Home Access
          Center using your existing browser session and never saw a password.
          That method was more protective of your privacy, but it functioned
          only on desktop computers, and it has been withdrawn.
        </p>
        <p className="text-text">
          Consequently, if you connect Home Access Center, we store that
          password in a form our server can read, which means{" "}
          <strong>we are able to access your gradebook.</strong> This is the only
          component of Insight for which that is true. Your study sessions,
          sleep records and all other entries remain encrypted under a key we do
          not hold; your Home Access Center gradebook does not.
        </p>
        <p>
          The password is used solely to sign in, retrieve the classwork page,
          and pass it to your browser, which parses and encrypts it before
          anything is stored. It is never included in a web address and never
          written to a log or error message. Nothing is saved unless the sign in
          succeeds, and disconnecting deletes the stored credential entirely.
        </p>
        <p>
          If your Home Access Center password is also your school email
          password, as is frequently the case, we recommend changing one of them
          before using this feature.
        </p>
        <p>
          <strong className="text-text">
            The browser extension and desktop applications.
          </strong>{" "}
          None of these can encrypt data, because encryption requires your
          password and we do not supply it to them. This is deliberate: software
          running continuously on your computer is not an appropriate place to
          hold that key. While a session is active, they therefore transmit
          website and application names in readable form, and these are held in
          a staging area our server can read until you next open Insight. At
          that point your browser encrypts them and the readable copy is
          deleted. Records that are never collected expire after six hours and
          are removed, both when a device next reports and once daily
          regardless.
        </p>
        <p className="text-text">
          In practical terms, this means that for a period of several hours we
          are able to see that a given website was open for a given number of
          minutes during a session. We cannot see what you read or watched, and
          we receive nothing at all from outside an active session. This is the
          single point at which the design does not hold, and we prefer to state
          it plainly.
        </p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          Insight sets no advertising cookies, no analytics cookies and no
          tracking pixels. Every item described below is strictly necessary for
          the service to function, and none is optional. For that reason no
          consent banner is presented.
        </p>
        <ul className="mt-2 space-y-3">
          <li>
            <strong className="text-text">Authentication cookies</strong>, set
            by Clerk, our sign in provider. These maintain your signed in
            session between pages. Without them, no page could identify the
            requesting user.
          </li>
          <li>
            <strong className="text-text">Your encryption key</strong>, if you
            selected the option to stay unlocked on the device. It is held in
            your browser&rsquo;s IndexedDB storage, never in a cookie, and never
            transmitted to us. A cookie is sent with every request, which is
            precisely why this key is not stored as one. Deselecting that option
            or choosing Lock this device in Settings erases it.
          </li>
          <li>
            <strong className="text-text">A small number of preferences</strong>{" "}
            in local storage, recording when you last viewed your grades, which
            setup prompts you dismissed, and when Canvas last synchronised.
            These remain on the device that wrote them and are not readable by
            us.
          </li>
        </ul>
        <p>
          Clearing your browser data removes all of the above. You will be
          signed out and asked for your Insight password again. No data is lost,
          as none of these items constitute your data.
        </p>
      </Section>

      <Section title="Data we never collect">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            Your location. Selecting &ldquo;Library&rdquo; records the word
            &ldquo;Library&rdquo; and nothing further. No GPS data is collected
            at any time.
          </li>
          <li>
            Your browsing outside a study session. The extension records website
            names only while a session is running.
          </li>
          <li>
            The contents of your screen. The desktop application records how
            long an application was in the foreground, not what was displayed or
            typed.
          </li>
          <li>
            Screen time screenshots. These are processed on your device and
            never uploaded. Only the resulting figure is stored, after you
            confirm it.
          </li>
        </ul>
      </Section>

      <Section title="The recommendation feature">
        <p>
          Once a pattern has sufficient supporting data, Insight may send a short
          summary to Groq, a third party service, in order to express it as a
          sentence of advice.
        </p>
        <p>
          The summary contains the validated pattern and the names and dates of
          upcoming assignments. It does not contain your name, email address,
          school, grades, sleep records or any individual session. The feature
          can be disabled, and it does not operate until a validated pattern
          exists.
        </p>
      </Section>

      <Section title="Age requirement">
        <p>
          Insight is available only to users aged 13 and over. We request each
          user&rsquo;s date of birth, and it is used for no other purpose. Users
          under 13 cannot proceed, and no further information is collected from
          them.
        </p>
        <p>
          This reflects the requirements of privacy law rather than any judgment
          about the user. Collecting information from a child under 13 requires
          verifiable parental consent, and providing that reliably is beyond
          what this project can undertake at present.
        </p>
        <p>
          A parent of any student may request access to everything we hold,
          request its deletion, or close the account.
        </p>
      </Section>

      <Section title="Your rights and choices">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Export all of your data as a file</li>
          <li>Delete individual entries, or your entire account</li>
          <li>
            Disconnect Canvas, disconnect Home Access Center, remove the
            extension, or uninstall the desktop applications, independently of
            one another
          </li>
          <li>Disable any category of insight you do not wish to receive</li>
        </ul>
      </Section>

      <Section title="Data retention">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Data is retained for as long as your account remains open</li>
          <li>
            On deletion of your account, data is erased within 30 days, and from
            backups within 90 days
          </li>
          <li>
            Dormant accounts are not deleted automatically. If you no longer
            wish to use Insight, please delete your account, which removes your
            data. We do not wish to state a retention practice we have not
            implemented.
          </li>
        </ul>
      </Section>

      <Section title="School records">
        <p>
          Insight receives no information from Frisco ISD. Data obtained from
          Canvas or Home Access Center is retrieved through your own account,
          with your authorisation. Your school cannot access your Insight data.
          FERPA, which governs records held by educational institutions, does
          not apply, as no institution transfers records to us.
        </p>
      </Section>

      <Section title="Third party services">
        <p>
          We use third party services only to operate Insight itself: hosting
          and database provision, authentication (Clerk), email delivery
          (Resend), and the recommendation service described above. None is
          permitted to use your data for its own purposes. We do not sell data,
          we do not display advertising, and we do not use your data to train
          artificial intelligence models.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Enquiries may be directed to{" "}
          <a
            href="mailto:kapilesh.rajaravi@gmail.com"
            className="text-accent underline underline-offset-2"
          >
            kapilesh.rajaravi@gmail.com
          </a>
          . If we make a material change to this policy, we will notify you by
          email before it takes effect.
        </p>
      </Section>
      </div>

      <SiteFooter />
    </main>
  );
}
