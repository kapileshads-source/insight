namespace Insight;

/// <summary>
/// What gets reported for a foreground process, and what gets thrown away.
///
/// Everything here is pure and covered by <see cref="SelfTest"/>, for the same
/// reason the extension's decision logic is: a bug in this file either records
/// something private or blocks the wrong thing.
/// </summary>
internal static class Apps
{
    /// <summary>
    /// Browsers are skipped entirely, because the extension already counts
    /// them.
    ///
    /// Counting both would double every minute a student spends on the web,
    /// and worse than double it: the extension would file that minute as
    /// distracted while this app filed the same minute as focused, so the
    /// distraction ratio — the number the whole insight engine turns on —
    /// would drift towards nonsense. A student with no extension loses their
    /// browser time here instead, which is a gap rather than a wrong answer.
    /// </summary>
    private static readonly HashSet<string> Browsers = new(StringComparer.OrdinalIgnoreCase)
    {
        "chrome", "msedge", "msedgewebview2", "firefox", "brave", "opera",
        "opera_gx", "vivaldi", "arc", "iexplore", "chromium", "thorium",
        "librewolf", "waterfox", "zen", "floorp",
    };

    /// <summary>
    /// Desktop apps reported under their website's name instead of their own.
    ///
    /// Focus Mode and the distraction figures are both defined by the
    /// student's blocklist, which is a list of hostnames — and a hostname is
    /// all the settings page can accept, because <c>normalizeSite</c> rejects
    /// anything that isn't domain-shaped. So the Spotify desktop app reported
    /// as "Spotify" would be untouchable: unblockable, and counted as focused
    /// time no matter what the student chose.
    ///
    /// Reporting it as <c>spotify.com</c> keeps one promise the rest of the
    /// app makes — that everything is measured against the student's own
    /// choices — and has the side effect of merging desktop and web time for
    /// the same service, which is what a student would expect anyway.
    ///
    /// Only apps whose hostname already appears in a block category are here.
    /// Anything else reports its own name.
    /// </summary>
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["spotify"] = "spotify.com",
        ["discord"] = "discord.com",
        ["discordptb"] = "discord.com",
        ["discordcanary"] = "discord.com",
        ["steam"] = "steampowered.com",
        ["steamwebhelper"] = "steampowered.com",
        ["robloxplayerbeta"] = "roblox.com",
        ["epicgameslauncher"] = "epicgames.com",
        ["minecraftlauncher"] = "minecraft.net",
        ["minecraft"] = "minecraft.net",
        ["telegram"] = "telegram.org",
        ["whatsapp"] = "web.whatsapp.com",
        ["netflix"] = "netflix.com",
        ["twitch"] = "twitch.tv",
        ["tidal"] = "tidal.com",
        ["itunes"] = "music.apple.com",
        ["applemusic"] = "music.apple.com",
        ["primevideo"] = "primevideo.com",
        ["disney+"] = "disneyplus.com",
        ["hulu"] = "hulu.com",
        ["crunchyroll"] = "crunchyroll.com",
        ["vsco"] = "vsco.co",
        ["pinterest"] = "pinterest.com",
    };

    /// The longest a reported name may be — the server's own limit for the
    /// field. Truncating here means a strange binary produces a short label
    /// rather than a rejected batch that takes the whole minute down with it.
    private const int MaxNameLength = 253;

    /// <summary>
    /// What to report for a foreground process, or null to record nothing.
    /// </summary>
    /// <param name="processName">Executable name, without the .exe.</param>
    /// <param name="fileDescription">
    /// The binary's <c>FileDescription</c> resource — "Discord", "Notepad".
    /// Static metadata compiled into the executable, so unlike a window title
    /// it says what the app is and never what is open in it.
    /// </param>
    internal static string? Report(string? processName, string? fileDescription)
    {
        string process = (processName ?? "").Trim();
        if (process.Length == 0) return null;

        if (process.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
        {
            process = process[..^4];
        }
        if (process.Length == 0) return null;

        if (Browsers.Contains(process)) return null;

        if (Aliases.TryGetValue(process, out string? domain)) return domain;

        string name = Clean(fileDescription);
        if (name.Length == 0) name = Clean(process);
        if (name.Length == 0) return null;

        // A description can be an alias too — the Spotify Store build's
        // executable is not called "spotify".
        if (Aliases.TryGetValue(name, out string? byDescription)) return byDescription;

        return name.Length > MaxNameLength ? name[..MaxNameLength] : name;
    }

    /// <summary>
    /// Strip anything that would leak a path or break the display.
    ///
    /// A file description is free text set by whoever built the binary, so it
    /// is treated as untrusted: control characters out, path separators out,
    /// whitespace collapsed.
    /// </summary>
    private static string Clean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";

        var buffer = new System.Text.StringBuilder(value.Length);
        bool lastWasSpace = false;

        foreach (char c in value)
        {
            // Whitespace first, because a tab is a control character too and
            // dropping it outright would weld two words into one.
            if (char.IsWhiteSpace(c))
            {
                if (buffer.Length > 0 && !lastWasSpace) buffer.Append(' ');
                lastWasSpace = true;
                continue;
            }

            if (char.IsControl(c)) continue;
            if (c == '\\' || c == '/') continue;

            buffer.Append(c);
            lastWasSpace = false;
        }

        return buffer.ToString().Trim();
    }

    /// <summary>
    /// Does a reported name fall under a blocklist entry?
    ///
    /// The same rule as <c>matchesBlocklist</c> in <c>src/lib/blocklist.ts</c>
    /// and <c>isBlocked</c> in the extension. All three have to agree, because
    /// "blocked" and "counted as a distraction" are meant to be the same
    /// sentence — a student blocked from something that never appears in their
    /// distraction figures would have no idea what happened.
    /// </summary>
    internal static bool IsBlocked(string? name, IReadOnlyList<string> blocklist)
    {
        if (string.IsNullOrEmpty(name)) return false;

        string clean = name.ToLowerInvariant();
        if (clean.StartsWith("www.", StringComparison.Ordinal)) clean = clean[4..];

        foreach (string entry in blocklist)
        {
            if (clean == entry || clean.EndsWith("." + entry, StringComparison.Ordinal))
            {
                return true;
            }
        }
        return false;
    }
}
