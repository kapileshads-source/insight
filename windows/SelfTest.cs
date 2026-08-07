namespace Insight;

/// <summary>
/// Tests for the decisions that must not be wrong.
///
/// Same tradeoff as <c>extension/logic.test.mjs</c>: the tray app needs a
/// Windows desktop to do anything, but the parts that decide what gets
/// recorded and what gets blocked are pure, and those are exactly the parts
/// where a bug either records something private or blocks the wrong thing.
///
/// Run with <c>Insight.exe --self-test</c>, or <c>dotnet run -- --self-test</c>.
/// </summary>
internal static class SelfTest
{
    private static int _pass;
    private static int _fail;

    private static void Ok(string name, bool condition)
    {
        if (condition)
        {
            _pass++;
            return;
        }
        _fail++;
        Console.WriteLine("FAIL  " + name);
    }

    private static void Same(string name, string? actual, string? expected)
    {
        bool same = actual == expected;
        if (!same)
        {
            Console.WriteLine($"FAIL  {name}\n        expected: {expected ?? "null"}"
                              + $"\n        actual:   {actual ?? "null"}");
            _fail++;
            return;
        }
        _pass++;
    }

    internal static int Run()
    {
        // A WinExe has no console of its own. Guarded so these same files can
        // be compiled for the host and run on the machine they were written
        // on — a Mac, in the first instance — which is the only way this test
        // gets run before a Windows machine is in the room.
        if (OperatingSystem.IsWindows()) Native.AttachToParentConsole();

        Console.WriteLine("Insight for Windows — logic tests\n");

        ReportTests();
        BlocklistTests();
        AddressTests();
        ParseTests();

        Console.WriteLine($"\n{_pass} passed, {_fail} failed");
        return _fail == 0 ? 0 : 1;
    }

    private static void ReportTests()
    {
        Same("browser is not reported at all",
            Apps.Report("chrome", "Google Chrome"), null);
        Same("browser with .exe suffix is not reported",
            Apps.Report("msedge.exe", "Microsoft Edge"), null);
        Same("a browser's helper process is not reported",
            Apps.Report("msedgewebview2", null), null);

        Same("aliased app reports its site, so the blocklist can reach it",
            Apps.Report("Spotify", "Spotify"), "spotify.com");
        Same("alias lookup ignores case",
            Apps.Report("DISCORD", "Discord"), "discord.com");
        Same("alias can be matched on the description",
            Apps.Report("SpotifyStoreBuild", "Spotify"), "spotify.com");
        Same("whatsapp maps to the hostname the blocklist actually contains",
            Apps.Report("WhatsApp", "WhatsApp"), "web.whatsapp.com");

        Same("unaliased app uses its file description",
            Apps.Report("WINWORD", "Microsoft Word"), "Microsoft Word");
        Same("no description falls back to the process name",
            Apps.Report("SomeTool", null), "SomeTool");
        Same("blank description falls back to the process name",
            Apps.Report("SomeTool", "   "), "SomeTool");

        Same("empty process name reports nothing", Apps.Report("", "Whatever"), null);
        Same("null process name reports nothing", Apps.Report(null, "Whatever"), null);
        Same("a bare .exe reports nothing", Apps.Report(".exe", null), null);

        Same("control characters are stripped from a description",
            Apps.Report("thing", "Ac\u0007me\tViewer"), "Acme Viewer");
        Same("path separators are stripped from a description",
            Apps.Report("thing", @"C:\Users\Sam\game.exe"), "C:UsersSamgame.exe");
        Same("runs of whitespace collapse",
            Apps.Report("thing", "  Acme    Reader  "), "Acme Reader");

        string huge = new('a', 400);
        Ok("an absurd description is truncated to the field's limit",
            Apps.Report("thing", huge)?.Length == 253);
    }

    private static void BlocklistTests()
    {
        var list = new List<string> { "youtube.com", "spotify.com", "roblox.com" };

        Ok("exact hostname matches", Apps.IsBlocked("youtube.com", list));
        Ok("subdomain matches", Apps.IsBlocked("music.youtube.com", list));
        Ok("www prefix matches", Apps.IsBlocked("www.spotify.com", list));
        Ok("case is ignored", Apps.IsBlocked("Roblox.com", list));

        Ok("an unrelated site does not match", !Apps.IsBlocked("khanacademy.org", list));
        Ok("a suffix that isn't a subdomain does not match",
            !Apps.IsBlocked("notyoutube.com", list));
        Ok("an app name does not accidentally match",
            !Apps.IsBlocked("Microsoft Word", list));
        Ok("nothing matches an empty name", !Apps.IsBlocked("", list));
        Ok("nothing matches an empty list",
            !Apps.IsBlocked("youtube.com", new List<string>()));

        // The server now sends app names in the same list as hostnames, which
        // is what finally makes a game blockable — it is its own executable
        // and has no website to match on.
        var withApps = new List<string> { "valorant", "minecraft", "youtube.com" };

        Ok("an app name matches", Apps.IsBlocked("Valorant", withApps));
        Ok("case is ignored for apps", Apps.IsBlocked("VALORANT", withApps));
        Ok("a two-word app name matches",
            Apps.IsBlocked("Minecraft", withApps));
        Ok("a school app is untouched",
            !Apps.IsBlocked("Microsoft Word", withApps));
        Ok("an app entry cannot swallow a hostname",
            !Apps.IsBlocked("valorant.example.com", withApps));
    }

    /// A pairing code sent over plain http to the internet is readable by
    /// anyone on the same wifi, so the pairing screen refuses. Local addresses
    /// stay allowed, because that is how this gets developed.
    private static void AddressTests()
    {
        Ok("https is fine",
            Address.IsAcceptable("https://insight-study-sleep.vercel.app", out _));
        Ok("https with a port is fine",
            Address.IsAcceptable("https://example.org:8443", out _));

        Ok("http to the internet is refused",
            !Address.IsAcceptable("http://insight-study-sleep.vercel.app", out _));
        Ok("and says why",
            !Address.IsAcceptable("http://example.org", out string why)
                && why.Contains("https"));

        Ok("http to localhost is allowed",
            Address.IsAcceptable("http://localhost:3000", out _));
        Ok("http to loopback is allowed",
            Address.IsAcceptable("http://127.0.0.1:3000", out _));
        Ok("http to a LAN address is allowed",
            Address.IsAcceptable("http://192.168.1.138:3000", out _));
        Ok("http to a 10-net address is allowed",
            Address.IsAcceptable("http://10.0.0.4:3000", out _));
        Ok("http to a .local name is allowed",
            Address.IsAcceptable("http://kapilesh-mac.local:3000", out _));

        Ok("172.20 is private, so allowed",
            Address.IsAcceptable("http://172.20.1.1:3000", out _));
        Ok("172.32 is not private, so refused",
            !Address.IsAcceptable("http://172.32.1.1:3000", out _));

        Ok("other schemes are refused", !Address.IsAcceptable("ftp://example.org", out _));
        Ok("a file path is refused", !Address.IsAcceptable("file:///etc/passwd", out _));
        Ok("nonsense is refused", !Address.IsAcceptable("not an address", out _));
        Ok("empty is refused", !Address.IsAcceptable("", out _));
    }

    private static void ParseTests()
    {
        PollResult idle = ApiClient.Parse("{\"session\":null,\"blocklist\":[\"YouTube.com\"]}");
        Ok("no session parses as no session", idle.Session is null);
        Same("blocklist entries are lowercased to match on", idle.Blocklist[0], "youtube.com");

        PollResult running = ApiClient.Parse(
            "{\"session\":{\"id\":\"abc\",\"startedAt\":\"2026-08-05T14:00:00.000Z\","
            + "\"focusMode\":true},\"blocklist\":[]}");
        Same("session id is read", running.Session?.Id, "abc");
        Ok("focus mode is read", running.Session?.FocusMode == true);
        Ok("start time is read",
            running.Session?.StartedAt.ToUniversalTime().Hour == 14);

        PollResult sparse = ApiClient.Parse("{}");
        Ok("a response missing everything is not a crash",
            sparse.Session is null && sparse.Blocklist.Count == 0);

        PollResult noFocus = ApiClient.Parse(
            "{\"session\":{\"id\":\"x\",\"startedAt\":\"2026-08-05T14:00:00.000Z\","
            + "\"focusMode\":false}}");
        Ok("focus mode off parses as off", noFocus.Session?.FocusMode == false);
    }
}
