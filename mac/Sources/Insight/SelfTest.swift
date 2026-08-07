import Foundation

/// Tests for the decisions that must not be wrong.
///
/// Same tradeoff as `extension/logic.test.mjs` and `windows/SelfTest.cs`: the
/// menu bar app needs a desktop, but the parts that decide what gets recorded
/// and what gets blocked are pure, and those are exactly the parts where a bug
/// either records something private or blocks the wrong thing.
///
/// These deliberately mirror the Windows tests case for case. Where the two
/// apps are supposed to agree, the tests should visibly agree too.
///
/// Run with `Insight --self-test`, or `swift run Insight --self-test`.
enum SelfTest {
    nonisolated(unsafe) private static var passed = 0
    nonisolated(unsafe) private static var failed = 0

    private static func ok(_ name: String, _ condition: Bool) {
        if condition {
            passed += 1
            return
        }
        failed += 1
        print("FAIL  \(name)")
    }

    private static func same(_ name: String, _ actual: String?, _ expected: String?) {
        if actual == expected {
            passed += 1
            return
        }
        failed += 1
        print("""
        FAIL  \(name)
                expected: \(expected ?? "nil")
                actual:   \(actual ?? "nil")
        """)
    }

    static func run() -> Int32 {
        print("Insight for macOS — logic tests\n")

        reportTests()
        blocklistTests()
        addressTests()
        parseTests()

        print("\n\(passed) passed, \(failed) failed")
        return failed == 0 ? 0 : 1
    }

    private static func reportTests() {
        same("browser is not reported at all",
             Apps.report(bundleId: "com.google.Chrome", name: "Google Chrome"), nil)
        same("Safari is not reported",
             Apps.report(bundleId: "com.apple.Safari", name: "Safari"), nil)
        same("Arc is not reported",
             Apps.report(bundleId: "company.thebrowser.Browser", name: "Arc"), nil)

        same("aliased app reports its site, so the blocklist can reach it",
             Apps.report(bundleId: "com.spotify.client", name: "Spotify"), "spotify.com")
        same("Discord maps to its site",
             Apps.report(bundleId: "com.hnc.Discord", name: "Discord"), "discord.com")
        same("whatsapp maps to the hostname the blocklist actually contains",
             Apps.report(bundleId: "net.whatsapp.WhatsApp", name: "WhatsApp"),
             "web.whatsapp.com")
        same("an unknown bundle id still maps on the name",
             Apps.report(bundleId: "com.someone.resigned", name: "Spotify"), "spotify.com")

        same("unaliased app uses its name",
             Apps.report(bundleId: "com.apple.TextEdit", name: "TextEdit"), "TextEdit")
        same("no bundle id is fine",
             Apps.report(bundleId: nil, name: "Some Tool"), "Some Tool")

        same("no name reports nothing", Apps.report(bundleId: "com.x.y", name: nil), nil)
        same("blank name reports nothing", Apps.report(bundleId: "com.x.y", name: "   "), nil)

        same("control characters are stripped from a name",
             Apps.report(bundleId: nil, name: "Ac\u{7}me\tViewer"), "Acme Viewer")
        same("path separators are stripped from a name",
             Apps.report(bundleId: nil, name: "/Applications/Thing.app"),
             "ApplicationsThing.app")
        same("runs of whitespace collapse",
             Apps.report(bundleId: nil, name: "  Acme    Reader  "), "Acme Reader")

        let huge = String(repeating: "a", count: 400)
        ok("an absurd name is truncated to the field's limit",
           Apps.report(bundleId: nil, name: huge)?.count == 253)
    }

    private static func blocklistTests() {
        let list = ["youtube.com", "spotify.com", "roblox.com"]

        ok("exact hostname matches", Apps.isBlocked("youtube.com", blocklist: list))
        ok("subdomain matches", Apps.isBlocked("music.youtube.com", blocklist: list))
        ok("www prefix matches", Apps.isBlocked("www.spotify.com", blocklist: list))
        ok("case is ignored", Apps.isBlocked("Roblox.com", blocklist: list))

        ok("an unrelated site does not match", !Apps.isBlocked("khanacademy.org", blocklist: list))
        ok("a suffix that isn't a subdomain does not match",
           !Apps.isBlocked("notyoutube.com", blocklist: list))
        ok("an app name does not accidentally match",
           !Apps.isBlocked("TextEdit", blocklist: list))
        ok("nothing matches an empty name", !Apps.isBlocked("", blocklist: list))
        ok("nothing matches an empty list", !Apps.isBlocked("youtube.com", blocklist: []))

        // The server now sends app names in the same list as hostnames, which
        // is what finally makes a game blockable — it is its own app and has
        // no website to match on.
        let withApps = ["valorant", "minecraft", "youtube.com"]

        ok("an app name matches", Apps.isBlocked("Valorant", blocklist: withApps))
        ok("case is ignored for apps", Apps.isBlocked("VALORANT", blocklist: withApps))
        ok("a two-word app name matches", Apps.isBlocked("Minecraft", blocklist: withApps))
        ok("a school app is untouched", !Apps.isBlocked("Pages", blocklist: withApps))
        ok("an app entry cannot swallow a hostname",
           !Apps.isBlocked("valorant.example.com", blocklist: withApps))
    }

    /// A pairing code sent over plain http to the internet is readable by
    /// anyone on the same wifi, so the pairing screen refuses. Local addresses
    /// stay allowed, because that is how this gets developed.
    private static func addressTests() {
        ok("https is fine", Address.problem(with: "https://insight-study-sleep.vercel.app") == nil)
        ok("https with a port is fine", Address.problem(with: "https://example.org:8443") == nil)

        ok("http to the internet is refused",
           Address.problem(with: "http://insight-study-sleep.vercel.app") != nil)
        ok("and says why",
           Address.problem(with: "http://example.org")?.contains("https") == true)

        ok("http to localhost is allowed", Address.problem(with: "http://localhost:3000") == nil)
        ok("http to loopback is allowed", Address.problem(with: "http://127.0.0.1:3000") == nil)
        ok("http to a LAN address is allowed",
           Address.problem(with: "http://192.168.1.138:3000") == nil)
        ok("http to a 10-net address is allowed",
           Address.problem(with: "http://10.0.0.4:3000") == nil)
        ok("http to a .local name is allowed",
           Address.problem(with: "http://kapilesh-mac.local:3000") == nil)

        ok("172.20 is private, so allowed", Address.problem(with: "http://172.20.1.1:3000") == nil)
        ok("172.32 is not private, so refused",
           Address.problem(with: "http://172.32.1.1:3000") != nil)

        ok("other schemes are refused", Address.problem(with: "ftp://example.org") != nil)
        ok("a file path is refused", Address.problem(with: "file:///etc/passwd") != nil)
        ok("nonsense is refused", Address.problem(with: "not an address") != nil)
        ok("empty is refused", Address.problem(with: "") != nil)
    }

    private static func parseTests() {
        let idle = ApiClient.parse(Data(#"{"session":null,"blocklist":["YouTube.com"]}"#.utf8))
        ok("no session parses as no session", idle.session == nil)
        same("blocklist entries are lowercased to match on",
             idle.blocklist.first, "youtube.com")

        let running = ApiClient.parse(Data(#"""
        {"session":{"id":"abc","startedAt":"2026-08-05T14:00:00.000Z","focusMode":true},
         "blocklist":[]}
        """#.utf8))
        same("session id is read", running.session?.id, "abc")
        ok("focus mode is read", running.session?.focusMode == true)
        ok("start time is read",
           running.session?.startedAt.timeIntervalSince1970 == 1_785_938_400)

        let noMillis = ApiClient.parse(Data(#"""
        {"session":{"id":"x","startedAt":"2026-08-05T14:00:00Z","focusMode":false}}
        """#.utf8))
        ok("a start time without milliseconds still parses",
           noMillis.session?.startedAt.timeIntervalSince1970 == 1785938400)

        let sparse = ApiClient.parse(Data("{}".utf8))
        ok("a response missing everything is not a crash",
           sparse.session == nil && sparse.blocklist.isEmpty)

        let broken = ApiClient.parse(Data("not json".utf8))
        ok("junk is not a crash", broken.session == nil && broken.blocklist.isEmpty)
    }
}
