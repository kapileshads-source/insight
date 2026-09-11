import Foundation

/// What gets reported for the app in front, and what gets thrown away.
///
/// The Windows twin of this file is `windows/Apps.cs` and the two must agree,
/// because a student with both machines should see one set of figures rather
/// than two dialects of the same day. Everything here is pure and covered by
/// `SelfTest`.
enum Apps {

    /// Browsers are skipped entirely, because the extension already counts
    /// them.
    ///
    /// Counting both would double every minute on the web, and worse, the
    /// extension would file that minute as distracted while this filed it as
    /// focused, so the distraction ratio the insight engine turns on would
    /// drift towards nonsense. A student with no extension loses their browser
    /// time here, which is a gap rather than a wrong answer.
    ///
    /// Matched on bundle identifier, which is exact. The Windows version has
    /// to match on executable names and guess a little.
    static let browsers: Set<String> = [
        "com.apple.Safari",
        "com.apple.SafariTechnologyPreview",
        "com.google.Chrome",
        "com.google.Chrome.canary",
        "com.microsoft.edgemac",
        "org.mozilla.firefox",
        "org.mozilla.firefoxdeveloperedition",
        "com.brave.Browser",
        "com.operasoftware.Opera",
        "com.vivaldi.Vivaldi",
        "company.thebrowser.Browser",
        "com.thebrowser.dia",
        "org.chromium.Chromium",
        "net.waterfox.waterfox",
        "app.zen-browser.zen",
    ]

    /// Apps reported under their website's name instead of their own.
    ///
    /// Focus Mode and the distraction split are both defined by the student's
    /// blocklist, which is a list of hostnames, `normalizeSite` won't accept
    /// anything else. So the Spotify app reported as "Spotify" would be
    /// untouchable: unblockable, and counted as focused time whatever the
    /// student chose. Reporting it as `spotify.com` keeps the whole app on one
    /// principle, that everything is measured against their own choices.
    ///
    /// Only apps whose hostname already appears in a block category are here.
    static let aliases: [String: String] = [
        "com.spotify.client": "spotify.com",
        "com.hnc.Discord": "discord.com",
        "com.hnc.DiscordPTB": "discord.com",
        "com.hnc.DiscordCanary": "discord.com",
        "com.valvesoftware.steam": "steampowered.com",
        "com.roblox.RobloxPlayer": "roblox.com",
        "com.epicgames.launcher": "epicgames.com",
        "com.mojang.minecraftlauncher": "minecraft.net",
        "ru.keepcoder.Telegram": "telegram.org",
        "org.telegram.desktop": "telegram.org",
        "net.whatsapp.WhatsApp": "web.whatsapp.com",
        "com.netflix.Netflix": "netflix.com",
        "tv.twitch.desktop": "twitch.tv",
        "com.tidal.desktop": "tidal.com",
        "com.apple.Music": "music.apple.com",
        "co.vsco.vscox": "vsco.co",
        "com.pinterest.mac": "pinterest.com",
    ]

    /// Names that map even when the bundle identifier is unfamiliar, a
    /// sideloaded or re-signed build of the same app.
    static let aliasesByName: [String: String] = [
        "spotify": "spotify.com",
        "discord": "discord.com",
        "steam": "steampowered.com",
        "roblox": "roblox.com",
        "netflix": "netflix.com",
        "twitch": "twitch.tv",
        "telegram": "telegram.org",
        "whatsapp": "web.whatsapp.com",
        "minecraft": "minecraft.net",
    ]

    /// The server's own limit for the field. Truncating here means a strange
    /// app produces a short label rather than a rejected batch that takes the
    /// whole minute down with it.
    static let maxNameLength = 253

    /// What to report for the app in front, or nil to record nothing.
    ///
    /// - Parameters:
    ///   - bundleId: e.g. `com.apple.TextEdit`. Exact, and free, unlike a
    ///     window title, reading it needs no Accessibility permission, which
    ///     is the permission this app deliberately never asks for.
    ///   - name: the app's localised name, e.g. "TextEdit".
    static func report(bundleId: String?, name: String?) -> String? {
        if let bundleId, browsers.contains(bundleId) { return nil }

        // Our own windows must not be counted as an app they chose to use.
        // Both sides have to exist for this to mean anything: run outside a
        // bundle, `swift run`, or the self-test, our own identifier is nil,
        // and a bare `==` would then swallow every app that hasn't got one.
        if let bundleId, let own = Bundle.main.bundleIdentifier, bundleId == own {
            return nil
        }

        if let bundleId, let domain = aliases[bundleId] { return domain }

        let cleaned = clean(name)
        if cleaned.isEmpty { return nil }

        if let domain = aliasesByName[cleaned.lowercased()] { return domain }

        return String(cleaned.prefix(maxNameLength))
    }

    /// Strip anything that would leak a path or break the display.
    ///
    /// An app's name comes from its bundle and is set by whoever built it, so
    /// it is treated as untrusted: control characters out, path separators
    /// out, whitespace collapsed. Note that whitespace is checked first, a
    /// tab is a control character too, and dropping it outright welds two
    /// words into one. The Windows version shipped that bug for an hour.
    static func clean(_ value: String?) -> String {
        guard let value else { return "" }

        var out = ""
        var lastWasSpace = false

        for character in value {
            if character.isWhitespace {
                if !out.isEmpty && !lastWasSpace { out.append(" ") }
                lastWasSpace = true
                continue
            }

            if character.unicodeScalars.allSatisfy({ CharacterSet.controlCharacters.contains($0) }) {
                continue
            }
            if character == "/" || character == "\\" { continue }

            out.append(character)
            lastWasSpace = false
        }

        return out.trimmingCharacters(in: .whitespaces)
    }

    /// Does a reported name fall under a blocklist entry?
    ///
    /// The same rule as `matchesBlocklist` in `src/lib/blocklist.ts`, `isBlocked`
    /// in the extension, and `Apps.IsBlocked` in the Windows app. All four have
    /// to agree, because "blocked" and "counted as a distraction" are meant to
    /// be the same sentence.
    static func isBlocked(_ name: String?, blocklist: [String]) -> Bool {
        guard let name, !name.isEmpty else { return false }

        var clean = name.lowercased()
        if clean.hasPrefix("www.") { clean = String(clean.dropFirst(4)) }

        return blocklist.contains { clean == $0 || clean.hasSuffix("." + $0) }
    }
}
