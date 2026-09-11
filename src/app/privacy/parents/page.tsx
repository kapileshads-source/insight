import Link from "next/link";
import { PageHero, SiteFooter, SiteNav } from "@/components/chrome";

export const metadata = { title: "For parents, Insight" };

/// A parent deciding whether to consent shouldn't have to read a full policy
/// to do it. This answers the questions they actually have, in the order they
/// actually ask them, and links to the complete version for anyone who wants
/// the detail.
export default function ParentsPage() {
  return (
    <main className="flex-1">
      <SiteNav />

      <PageHero
        eyebrow="For parents"
        title="For parents."
        lede="Your child has asked to use Insight. Here’s what it does, what it keeps, and what you can do about it, in plain terms, without needing to take our word for anything."
      />

      <div className="mx-auto w-full max-w-3xl px-6 py-16">

      <div className="mt-10 space-y-8">
        {[
          {
            q: "What does it do?",
            a: "It records how your child studies, when, where, for how long, and on how much sleep, and compares that against their own grades. The point is to show them patterns in their own habits, measured against their own averages rather than against other students.",
          },
          {
            q: "Who can see the data?",
            a: "Nobody but your child. It's encrypted on their device before it reaches us, using a key made from their password. We hold scrambled data and no way to unscramble it. That includes us, and it would include anyone who broke into our database. There are two exceptions, both in the questions below, and they are worth reading, one of them is about their gradebook and it is the biggest single thing on this page.",
          },
          {
            q: "Does the school see it?",
            a: "No. Frisco ISD isn't involved, doesn't receive anything, and Insight isn't affiliated with the district. Grades come from your child's own Canvas or Home Access Center account, and only if they choose to connect one. Nothing flows the other way: the school is never sent anything.",
          },
          {
            q: "Is their location tracked?",
            a: "No. Your child picks from a list, Library, Home, Classroom, and we record that word. There is no GPS and no location permission.",
          },
          {
            q: "What about browsing?",
            a: "The optional browser extension records site names only while a study session is actively running, and nothing at any other time. It never records page contents or what they type. The same is true of the optional Windows and Mac apps, which record the names of apps that were in front, never window titles, so never which document or which video.",
          },
          {
            q: "Is there anything you can read?",
            a: "Yes, briefly, and we'd rather say so plainly. The extension and the desktop apps can't encrypt anything, that needs your child's password, and we never give it to them, because a program running on a laptop all day is the last place that key should sit. So while a session is running they send us plain site and app names, and those stay readable to us until the next time your child opens Insight, when their browser encrypts them and deletes the readable copy. Anything not collected expires after six hours and is swept away, whenever a device next reports, and once a day regardless. In practice that means we could see that a session on Tuesday included twenty minutes of YouTube, not what was watched, and nothing from outside a study session.",
          },
          {
            q: "Can you read their gradebook?",
            a: "Only if your child chooses the option that lets us, and we want to be direct about it. There are two ways to bring Home Access Center grades in. The first uses a browser extension and the login they already have in that browser, so we never see a password, it is the better option and it only works on a computer. The second is for phones: your child gives us their HAC username and password so our server can sign in for them. If they choose that, we store that password in a form we can read, which means we can open their gradebook. It is the only part of Insight where that is true. Everything else, sleep, study sessions, the patterns, stays encrypted with a key we do not have.",
          },
          {
            q: "What do you do with that password?",
            a: "Sign in, fetch the classwork page, and hand it straight to your child's browser, which reads it and encrypts it before anything is stored. It is never put in a web address and never written into a log or an error message. Nothing is saved unless the sign-in actually works, so a typo is never kept. Disconnecting deletes it outright rather than leaving an empty row behind. One thing worth checking with your child: at many schools the HAC password is the same one as the school email. If theirs is, they should change one of them, or use the extension, which never asks for a password at all.",
          },
          {
            q: "Is it sold or advertised against?",
            a: "No. Insight doesn't sell data, doesn't run ads, and doesn't use your child's data to train AI models. Their study records are encrypted and unreadable to us, and the site and app names described above are deleted rather than kept, neither is sold, shared or advertised against.",
          },
          {
            q: "How old do they have to be?",
            a: "Thirteen. We ask everyone's birth date and turn away anyone younger, because collecting data from an under-13 needs a parent's verified permission and we'd rather decline than do that badly. If your child is using it, they told us they're 13 or over.",
          },
          {
            q: "Can I change my mind?",
            a: "Any time. Withdraw consent and the account closes and the data is erased. You can also ask to see everything we hold, or have it deleted, without closing the account.",
          },
          {
            q: "What if they forget their password?",
            a: "Their data becomes permanently unreadable, including to us. That's the trade for nobody else being able to read it either. It's worth making sure they write it down somewhere.",
          },
        ].map(({ q, a }) => (
          <div key={q} className="border-t border-line pt-6">
            <h2 className="h3 text-[19px]">{q}</h2>
            <p className="mt-3 text-[17px] leading-relaxed text-text-muted">
              {a}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-lg border border-line bg-surface p-6">
        <p className="text-[17px] leading-relaxed">
          Questions before you decide? Write to{" "}
          <a
            href="mailto:kapilesh.rajaravi@gmail.com"
            className="text-accent underline underline-offset-2"
          >
            kapilesh.rajaravi@gmail.com
          </a>{" "}
          and a person will answer.
        </p>
        <p className="mt-4 text-[15px] text-text-faint">
          The full detail is on the{" "}
          <Link
            href="/privacy"
            className="text-accent underline underline-offset-2"
          >
            main privacy page
          </Link>
          .
        </p>
      </div>
      </div>

      <SiteFooter />
    </main>
  );
}
