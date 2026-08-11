# Insight for Android

The third tracker, and the only phone that can honestly measure its own use.
iOS gates that behind an entitlement Apple grants to parental-control
companies; Android asks the student for a permission, in their own Settings,
that they can take back in the same place.

It adds nothing to the server: pairs with a token minted at `/devices`, polls
`GET /api/devices/session`, posts app names in the `domain` field to
`POST /api/devices/activity`. Same two endpoints as the extension.

## What it records, and what it can't

- **Nothing without a running session.** The timer does not accumulate.
  `TrackerService.tick` checks that first.
- **Browsers are counted, unlike on the desktops.** There the extension counts
  them and this app skipping them prevents double counting; Chrome for Android
  can't run extensions, so skipping them made phone browsing invisible and
  unblockable. A browser can be blocked, but only whole and only if the student
  names it — telling YouTube from Wikipedia inside one means reading the screen,
  which nothing in this project does.
- **App names only** — "Spotify", "Notion". The usage-access permission gives
  a package name and a label. It does not give what is on screen, what was
  typed, or anything inside an app.
- **Nothing while the screen is off.** A phone in a pocket still names a
  foreground app, and without this a student would be billed for the walk home.
  This is the Android equivalent of the ten-minute idle rule on the desktops.
- **No encryption key, ever.** What it posts lands in `PendingDeviceData`,
  which the server *can* read, and the student's browser encrypts and deletes.
- **Nothing on disk except the pairing token**, in app-private preferences with
  `allowBackup="false"`. The tally lives in memory and is sent every minute.

## The permission is the feature

`PACKAGE_USAGE_STATS` isn't granted by tapping Allow. The student goes to
Settings and turns on usage access for Insight specifically. That is friction
we keep rather than route around: it is the same act as the promise, and it can
be undone in the same screen.

The service also runs in the foreground with a permanent notification, which
Android requires and which is the right rule — an app counting what you use
should not be able to do it invisibly.

## Build

Needs the Android SDK and JDK 17–21. The Gradle wrapper is pinned to 8.11.1
because the Android plugin lags newer Gradle, and Homebrew's is well ahead.

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=~/Library/Android/sdk ./gradlew :app:assembleDebug
```

The APK lands in `app/build/outputs/apk/debug/` at about 8MB. Sideload it with
`adb install`, or hand it to a student who has turned on installing from
unknown sources — there is no Play listing, and a $25 one-time developer fee
would be the price of one.

## Test

```bash
cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=~/Library/Android/sdk ./gradlew :app:testDebugUnitTest
```

16 tests over `Apps` and `Address` — what gets reported, what gets blocked, and
which addresses are safe to send a pairing code to. They mirror the Windows and
Mac suites case for case, because five clients that are supposed to agree
should be seen to agree.

## Blocking, which iPhone can't do

Open a blocked app during a session with Focus Mode on, and Insight's own
screen replaces it. No entitlement, no approval, no company behind it — the
whole difference between this and the iPhone, where the best available is a
Shortcuts automation that bounces you out.

It needs a second Settings-granted permission, `SYSTEM_ALERT_WINDOW`, asked for
separately and only once usage access is on. Counting works without it; nothing
is blocked without it. A student who wants the measurement and not the blocking
can stop at the first permission, and one who wants Focus Mode is told plainly
that it does nothing until this is granted.

Since Android 10 that permission is also what allows a background service to
start an activity at all, so it is load-bearing twice over.

**The blocked app is closed, not just covered.** The first version put a screen
in front and left the app running behind it, so going back resumed exactly where
you were and the block read as a curtain rather than a door.
`killBackgroundProcesses` is called once our screen is in front — by then the
blocked app is a background process, which is all that call can reach. It is not
a force-stop, which needs privileges no sideloaded app has, but it is enough
that reopening starts the app cold and meets the block again.

The cooldown now throttles only what gets *recorded*, so ten reopenings don't
fill a batch with ten identical rows. It used to throttle the blocking itself,
which left a thirty-second window where a blocked app opened perfectly.

The override is the same three-second countdown as the extension and both
desktop apps. It's recorded, and it relaunches the app — having closed it,
leaving the student to go and find it again would be worse than the block. Back
is disabled on that screen: it would drop you into the app that was just
blocked, which makes the block look broken. "Back to work" sends you home.

## Blocking sites, not just apps

The extension blocks sites on a laptop and Chrome for Android can't run it, so
the only place left to say no to `youtube.com` on a phone is the lookup itself.
`FocusVpnService` is a local VPN that carries **nothing but DNS**, answers "no
such name" for anything on the student's blocklist, and forwards everything
else to the resolver the phone was already using.

Three things make that defensible, and all three are enforced rather than
promised:

- **It runs only while a session is running with Focus Mode on.** The tracker
  starts and stops it; there is no state where it lingers.
- **Only DNS enters the process.** The tunnel routes exactly one address — the
  resolver we advertise. Pages, messages, video and everything else never touch
  it. That is one line in `connect()`, and it is the most important line here.
- **Nothing is recorded.** Blocked names become block events like any other;
  allowed names are forwarded and forgotten.

Upstream is whatever resolver the phone would have used anyway, read from the
active network. Sending every lookup to a public resolver instead would quietly
move a student's browsing history to a company they didn't choose, which is a
bigger change to their privacy than the blocking is worth.

**Consent is asked for in `MainActivity`, not by the service.** Android hands
the VPN dialog to activities only, and `FocusVpnService.start` returns quietly
when consent is missing — so a service asking for itself would fail silently
forever. It shipped that way once: the whole thing was built, wired to the
session, and never once ran.

**The tunnel runs as a foreground service.** Android refuses to *start* a
background service while the app is in the background, which is always for a
tracker. That refusal first crashed the app, then — once it was caught — made
site blocking silently never happen. A foreground service with its own
notification is what Android actually permits, and the notification is honest
anyway: something is filtering your lookups and you should be able to see that.

**"Allowed" and "running" are separate checks on the status screen.** They are
different sentences, and showing only the first meant a green tick beside a
feature that wasn't working.

**The honest limitation:** a browser using DNS-over-HTTPS never asks us, and
never sees the block. So do browsers with a VPN of their own — Opera's built-in
VPN and Chrome's Secure DNS both route around this, and Android permits one VPN
at a time. The status screen says so once blocking is on, because a student
whose blocked site loads anyway deserves to know where to look. Chrome turns Secure DNS off while a VPN is active in most
configurations, but not all. Friction rather than a wall — like everything else
here.

**It needs `ACCESS_NETWORK_STATE`, and that is not obvious.** Reading which
resolver the phone already uses is a permission-guarded call, and asking without
the permission *throws* rather than returning null. It threw on the DNS thread's
first instruction, every single time: consent granted, service in the
foreground, tunnel established, notification showing — and the thread died
before it read one packet. Site blocking never worked once, on any build, for
this one missing line.

The permission is also the privacy story rather than a technicality. Without it
the only option is a public resolver, which would move a student's browsing
history to a company they didn't choose. This is what lets us forward lookups
where they were already going.

**One socket per lookup, and never one shared socket.** The first version
handled queries strictly in turn: send, block until *a* reply arrives, assume
it belongs to the query just sent. Android's resolver asks for A and AAAA at
once, several hostnames per page, so replies interleave — and each was handed
to the port of whichever query we were waiting on. After the first mismatch
every answer went to the wrong asker.

This tunnel advertises itself as the phone's **only** resolver, so that wasn't
slow browsing. Nothing on the phone could resolve anything at all. A single
`ping` passed the whole time, because one query with nothing else in flight is
the one case the design got right — which is exactly why it survived review.

**It fails open.** Twelve failed lookups in a row and the tunnel hands DNS back
to the phone, records why, and stops. A student whose phone can't load anything
does not care which of our components is at fault, and may be in the middle of
something that matters. The worst case of failing open is an unblocked session;
the worst case of holding on is a phone that doesn't work.

`Dns.kt` is pure and has 8 tests, because packet parsing that is nearly right
fails like flaky wifi, and a student would blame the school's network before
they blamed the byte offsets.

## Two failures that look like health

Both found on a real phone, and both are the same shape: the app appears fine
while recording nothing.

**The service only started at the moment of pairing.** Reinstall the app, or
reboot the phone, and it opened to a status screen saying all was well with no
tracker running. It now starts whenever the app opens paired, and a boot
receiver starts it after a restart.

**And now it says so.** The tracker stamps a heartbeat every poll, and the
status screen calls it out if that stamp is minutes old, with a button to start
it again. An hour nobody measured is indistinguishable from an hour of perfect
focus by the time it reaches the insight engine, so silence has to be visible.

## Why nothing is being blocked

Blocking has five preconditions and four of them are invisible from outside the
app: a session running, Focus Mode on, a blocklist that arrived, usage access,
and drawing over other apps. Website blocking adds a sixth, the VPN consent.

So the status screen lists all six with a tick or a cross, and says what to do
about each miss. "It isn't blocking" is otherwise undiagnosable without holding
the phone — which is exactly where an evening goes.

## "Insight keeps stopping"

Found on a real phone, and worth writing down because the shape recurs.

`FocusVpnService.stop()` reaches the VPN service by *starting* it — that's how
you send a service a command. Every poll without a focused session called it, so
once the app was in the background Android refused to start a background service
and threw, out of the polling coroutine, killing the process. START_STICKY
brought it back, fifteen seconds later the same thing happened, and eventually
the phone gave up on the app entirely. Nothing recorded, nothing blocked.

Three changes, in increasing order of generality:

1. The tracker only asks to stop a tunnel it asked to start.
2. Every background start is wrapped, and the polling loop catches everything —
   a tracker that limps is worth far more than one that dies.
3. **The app records its own crashes.** Android tells a student "Insight keeps
   stopping" and tells us nothing; a stack trace lives in logcat, which needs a
   cable and a laptop. `InsightApplication` writes the last one to preferences
   and the status screen shows it, so a screenshot is enough to fix it.

## The status screen reads state on a timer

Everything it shows is written by a service on its own schedule: the poll lands
up to fifteen seconds after the app opens, and the tunnel a moment after that.
It used to read once, on resume — so it showed the state from *before* any of
that happened, and a failure that was being recorded correctly appeared as "the
app didn't record why".

That cost a full round trip with a real tester. Any panel describing something
asynchronous has to re-read while it's on screen, not when it opens.

## Verified on a real phone

Nothing Phone 2a, Android 16, over adb on 2026-08-11. App blocking closes a
blocked app and replaces it with our screen. Site blocking refuses a blocked
lookup and forwards the rest:

```
$ adb shell ping -c 1 youtube.com     → ping: unknown host youtube.com
$ adb shell ping -c 1 wikipedia.org   → 64 bytes from ... time=82.1 ms
```

Still unexercised: the override countdown, the ten-minute idle rule, and a
session-end flush.

## Debug it with a cable, not with screenshots

Four rounds of "install this and tell me what it says" bought less than five
minutes of `adb logcat`, and the cause was never once where the screenshots
pointed. Reach for the cable earlier than feels necessary.

```bash
~/Library/Android/sdk/platform-tools/adb shell run-as app.insight.android cat shared_prefs/insight.xml
```

That one line prints everything the status screen shows, without the phone
being in anyone's hand. `dumpsys activity services app.insight.android` says
whether the services are actually alive, which the app itself cannot tell you
when the failure is that it isn't running.
