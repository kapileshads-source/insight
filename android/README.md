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

## What's built, and what isn't

Built: pairing, the permission flow, the status screen, and the tracker
service — counting, batching and reporting.

Not built: **blocking**. This is where Android beats iOS outright — a blocked
app can be replaced with our own screen, properly, no entitlement needed. It
wants `SYSTEM_ALERT_WINDOW` (draw over other apps), which is a second
Settings-granted permission, and a full-screen activity like the desktop apps'
blocked window with the same three-second override.

Also not done: nobody has run this on a real phone or an emulator. It builds
and its logic is tested; the service, the permission flow and the usage-events
sampling are unexercised.
