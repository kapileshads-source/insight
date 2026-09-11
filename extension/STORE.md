# Publishing the extension

Everything the Chrome Web Store form asks for, written out. Paste it in.

**Why this is the only route:** Chrome removed self-hosted `.crx` installs, so an
extension downloaded from a website is silently blocked. "Load unpacked" needs
developer mode, keeps working only while the folder stays where it is, never
updates itself, and makes Chrome nag on every launch. For a pilot that's a
support burden you answer messages about weekly.

**Cost and time:** $5 once, to register as a developer. Review is usually a few
days. Choose **Unlisted** visibility, installable by anyone with the link, not
findable by searching, no need to be public.

---

## Listing

**Name**

```
Insight
```

**Summary** (132 characters max)

```
Counts the sites you use during a study session, and blocks distracting ones while Focus Mode is on. Nothing outside a session.
```

**Description**

```
Insight is a study tracker for students. This extension is the part that watches your browser, and only while you're actually studying.

WHAT IT DOES

When you start a study session on Insight, this counts how long you spend on each site, so you can see where the hour went rather than guessing. When Focus Mode is on, it redirects sites on your blocklist to a page that offers a way back, and a way through if you really mean it.

WHAT IT DOESN'T DO

Nothing is recorded when no session is running. Not recorded and discarded, the timer doesn't accumulate at all.

It keeps hostnames, never full addresses. "wikipedia.org", not which article. That's enforced in the code rather than promised in a policy.

It holds no encryption key, so it cannot read anything you've written in Insight. Pairing grants the ability to add, never to read.

You start and stop sessions on the Insight website. This extension has no settings of its own beyond pairing, because a second place to configure something is a second place to be wrong.

REQUIRES AN INSIGHT ACCOUNT

Free, at https://insight-study-sleep.vercel.app, you'll paste a pairing code from your Devices page.

Insight is built by two students in Frisco ISD. It is not run by, endorsed by, or affiliated with the district.
```

**Category:** Workflow & Planning
**Language:** English

---

## Privacy tab

**Single purpose**

```
Records which websites are used during a study session the user has started in Insight, and blocks sites on the user's own blocklist while Focus Mode is on.
```

**Permission justifications**

`storage`

```
Stores the pairing code for the user's Insight account and the current session's running tally of seconds per site. The tally is cleared every minute once it is sent.
```

`tabs`

```
Reads the hostname of the active tab to count how long each site is used during a study session. Only the hostname is kept, never the full URL, the page title, or the contents. Nothing is read while no session is running.
```

`alarms`

```
Manifest V3 service workers are stopped when idle. A one-minute alarm wakes the extension to send the tally to the user's account and to ask whether a study session is still running.
```

Host permission, `https://insight-study-sleep.vercel.app/*`

```
The extension talks to exactly one server: the user's own Insight account. It asks whether a session is running and sends the session's site tally. No other host is contacted.
```

Optional host permissions, `https://*/*`, `http://*/*`

```
Not requested at install. Some users run their own copy of Insight at a different address; when they enter one while pairing, permission for that single address is requested at that moment. Users of the hosted version are never asked.
```

**Data usage, disclose these, they are true**

- **Authentication information**, the pairing code, stored locally, which grants
  the ability to add activity to one account and nothing else.
- **Web history**, hostnames of sites used while a study session is running.

**Certifications, all of which hold**

- Not sold to third parties.
- Not used or transferred for anything unrelated to the single purpose above.
- Not used to determine creditworthiness or for lending.

**Privacy policy URL**

```
https://insight-study-sleep.vercel.app/privacy
```

---

## Screenshots

One to five, at 1280×800 or 640×400. Three that tell the story:

1. The popup while a session runs, green dot, "Studying, Focus Mode on".
2. The blocked page, with the site named and the override button visible.
3. The Devices page on the website, showing where the pairing code comes from.

Take them on a screen with nothing personal visible, and use a test account
rather than your own data.

---

## Before you upload

Zip the **contents** of `extension/`, not the folder itself, `manifest.json`
has to sit at the root of the zip.

```bash
cd extension && zip -r ../insight-extension.zip . -x '*.DS_Store' 'STORE.md' 'logic.test.mjs'
```

Bump `version` in `manifest.json` for every upload; the store refuses a version
it has seen before.

After it's published, update the install steps on `/devices`, they currently
describe Load unpacked, which stops being the route students take.
