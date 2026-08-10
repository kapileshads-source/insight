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

The blocked app is left running rather than killed — losing whatever was in it
feels punitive, and a punitive tool gets uninstalled, at which point it blocks
nothing. The override is the same three-second countdown as the extension and
both desktop apps, and it's recorded, so the session's figures reflect what
happened rather than what was intended. Back is disabled on that screen: it
would drop you into the app that was just blocked, which makes the block look
broken. "Back to work" sends you home.

## What isn't done

Nobody has run this on a phone or an emulator. It builds, and 16 unit tests
cover what gets reported and what gets blocked — but the service, both
permission flows, the usage-events sampling and the blocked screen itself are
all unexercised.
