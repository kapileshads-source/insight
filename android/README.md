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

**The honest limitation:** a browser using DNS-over-HTTPS never asks us, and
never sees the block. Chrome turns Secure DNS off while a VPN is active in most
configurations, but not all. Friction rather than a wall — like everything else
here.

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

## What isn't done

Nobody has run this on a phone or an emulator. It builds, and 16 unit tests
cover what gets reported and what gets blocked — but the service, both
permission flows, the usage-events sampling and the blocked screen itself are
all unexercised.
