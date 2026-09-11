#!/bin/bash
#
# Build Insight.app.
#
# SwiftPM produces a bare executable, which can't carry an Info.plist and so
# can't be a menu-bar-only app, can't register as a login item, and can't be
# double-clicked. This wraps it in the bundle macOS expects.
#
# Needs only the Command Line Tools, no Xcode, no project file.

set -euo pipefail

cd "$(dirname "$0")"

APP="dist/Insight.app"
VERSION="0.1.0"

echo "Building…"
swift build -c release 2>&1 | grep -v "ld: warning: search path" || true

BINARY=".build/release/Insight"
if [ ! -f "$BINARY" ]; then
  echo "Build produced no binary. Stopping." >&2
  exit 1
fi

echo "Assembling $APP…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BINARY" "$APP/Contents/MacOS/Insight"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>Insight</string>
    <key>CFBundleDisplayName</key>
    <string>Insight</string>
    <key>CFBundleIdentifier</key>
    <string>app.insight.mac</string>
    <key>CFBundleExecutable</key>
    <string>Insight</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>$VERSION</string>
    <key>CFBundleVersion</key>
    <string>$VERSION</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <!-- Menu bar only: no Dock icon, no app switcher entry. -->
    <key>LSUIElement</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string>Insight</string>
</dict>
</plist>
PLIST

# Ad-hoc signature. It buys no trust from Gatekeeper, that needs a paid
# Developer ID and notarisation, but an unsigned binary on Apple silicon
# won't launch at all, and a stable signature stops the keychain treating
# every rebuild as a different app asking for the token.
echo "Signing (ad-hoc)…"
codesign --force --sign - --timestamp=none "$APP" >/dev/null 2>&1

echo
echo "Built $APP"
echo
echo "First run: right-click the app and choose Open, then Open again."
echo "Double-clicking an unsigned app gets refused without that; it's once only."
