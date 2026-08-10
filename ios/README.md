# Insight for iPhone

A companion, not a tracker. iOS grants no way to see which app is in front, or
to block one, without the `FamilyControls` entitlement — which Apple *grants*
rather than sells, and grants to parental-control companies. $99/yr buys the
right to ask. Assume the answer is no and design accordingly.

So this is where a student starts a session, logs a night's sleep, and reads
what Insight made of it. Measuring stays on the laptop, and phone screen time
keeps arriving through the Screen Time screenshot and OCR.

## Build and run

Needs Xcode and XcodeGen (`brew install xcodegen`).

```bash
cd ios && xcodegen generate && open Insight.xcodeproj
```

The `.xcodeproj` is generated, not committed — a pbxproj is unreadable in a diff
and merges badly. `project.yml` says the same thing in twenty lines.

From the command line, for the simulator:

```bash
xcodebuild -project Insight.xcodeproj -scheme Insight -sdk iphonesimulator -configuration Debug build
```

## Onto a real phone

Open the project in Xcode, pick your Apple ID under Signing & Capabilities, plug
the phone in, and hit run. A free Apple ID works — the app **expires after seven
days** and needs re-signing by plugging in again. Three apps maximum.

$99/yr removes that and unlocks TestFlight: 100 testers, no expiry. That is what
the money actually buys. It does not buy the tracking entitlement.

## Shared with the Mac app

`project.yml` compiles `ApiClient.swift` and `Address.swift` straight out of
`../mac/Sources/Insight/`. Both are pure Foundation, and two apps that talk to
the same endpoints under the same rule about what counts as a safe address
shouldn't be able to drift apart. Anything that imports AppKit or UIKit can't be
shared this way, which is a useful pressure: it keeps decisions in files that
have no interface attached.

## What's built

Pairing, and the status screen — am I connected, am I recording. Same two
questions the extension popup and both tray apps answer.

## What it does with your key

The phone is the only client that holds one, so the rules are worth stating.

- **In memory only.** Never written down. Killing the app locks it.
- **Dropped after two minutes in the background.** Long enough to run a
  shortcut or answer a message and come back; short enough that a phone left on
  a desk is locked by the time someone else picks it up.
- **What is on disk** — the address, the device token, and the encryption setup
  — sits in the app container with complete file protection and is **excluded
  from iCloud backups**. The wrapped key is useless without the password, but a
  backup is an offline copy that leaves the phone, and an offline copy is what
  makes grinding at a password worth someone's time. Cost: re-pair after
  restoring a phone.
- **The pairing code is cleared** from the field and from the system clipboard
  once it's been used, since Universal Clipboard otherwise hands it to every
  Apple device on the account.
- **https only.** `Address` allows plain http to a local address, which is
  right on a laptop and impossible here — iOS refuses cleartext outright, so
  allowing it would only produce "couldn't reach" and send someone to check
  their wifi over a problem no wifi will fix.
- **The iteration count in a pairing code is bounded**, floor and ceiling. It
  arrives inside the code, so a doctored one could otherwise hand the phone a
  KDF weak enough to brute-force, or heavy enough that unlocking looks like a
  hang.

Not done, and worth knowing: the app switcher snapshot isn't hidden, so
whatever was on screen when you switched away is briefly stored by iOS.

## What's next

- Session start and stop, which needs endpoints that don't exist yet
- Unlocking with the password, deriving the key with CryptoKit as the browser
  does, so sleep and scores can be logged from the phone
- The Focus-mode handshake: a Study Focus and a Shortcut set up once, and
  `shortcuts://run-shortcut?name=Study` when a session starts
