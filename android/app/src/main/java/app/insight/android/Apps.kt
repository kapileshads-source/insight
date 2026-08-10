package app.insight.android

/**
 * What gets reported for an app in the foreground, and what gets thrown away.
 *
 * The Windows and Mac twins are `windows/Apps.cs` and `mac/Sources/Insight/
 * Apps.swift`, and all three must agree — a student with a laptop and a phone
 * should see one set of figures rather than three dialects of the same day.
 *
 * Pure, and covered by `AppsTest`.
 */
object Apps {

    /**
     * Browsers are counted here, unlike on Windows and the Mac.
     *
     * There, the extension counts them and this app skipping them is what
     * stops every web minute being counted twice. **Chrome for Android can't
     * run extensions**, so on a phone there is nothing to double up with — and
     * excluding them made a student's entire phone browsing invisible to
     * Insight and impossible to block. That was an inherited rule rather than
     * a decision.
     *
     * What this app still can't do is tell YouTube from Wikipedia inside a
     * browser. Reading a URL out of another app means an accessibility
     * service, which reads the contents of the screen — the one thing every
     * client here has promised never to do. So a browser is blocked whole or
     * not at all, and only if the student names it themselves.
     */
    private val browserPackages = setOf(
        "com.android.chrome",
        "com.chrome.beta",
        "com.chrome.dev",
        "com.chrome.canary",
        "org.mozilla.firefox",
        "org.mozilla.fenix",
        "com.microsoft.emmx",
        "com.brave.browser",
        "com.opera.browser",
        "com.opera.mini.native",
        "com.duckduckgo.mobile.android",
        "com.sec.android.app.sbrowser",
        "com.android.browser",
    )

    /** Whether a package is a browser — used only to explain itself in the UI. */
    fun isBrowser(packageName: String?): Boolean = packageName in browserPackages

    /**
     * Apps reported under their website's name.
     *
     * Focus Mode and the distraction split are both defined by the student's
     * blocklist, which is hostnames plus the app names the settings page now
     * accepts. Reporting Spotify as `spotify.com` puts phone and laptop and
     * web time for one service in the same bucket, which is what a student
     * would expect — and matches what the desktop apps already do.
     */
    private val aliases = mapOf(
        "com.spotify.music" to "spotify.com",
        "com.discord" to "discord.com",
        "com.valvesoftware.android.steam.community" to "steampowered.com",
        "com.roblox.client" to "roblox.com",
        "com.mojang.minecraftpe" to "minecraft.net",
        "org.telegram.messenger" to "telegram.org",
        "com.whatsapp" to "web.whatsapp.com",
        "com.netflix.mediaclient" to "netflix.com",
        "tv.twitch.android.app" to "twitch.tv",
        "com.google.android.youtube" to "youtube.com",
        "com.zhiliaoapp.musically" to "tiktok.com",
        "com.instagram.android" to "instagram.com",
        "com.snapchat.android" to "snapchat.com",
        "com.facebook.katana" to "facebook.com",
        "com.reddit.frontpage" to "reddit.com",
        "com.twitter.android" to "x.com",
        "com.pinterest" to "pinterest.com",
        "com.amazon.mShop.android.shopping" to "amazon.com",
        "com.epicgames.fortnite" to "fortnite.com",
        "com.riotgames.league.wildrift" to "leagueoflegends.com",
    )

    /** The endpoint's own limit for the field. */
    private const val MAX_NAME_LENGTH = 253

    /**
     * What to report, or null to record nothing.
     *
     * @param packageName e.g. `com.spotify.music`. Exact, unlike a Windows
     *   executable name, and free — reading it needs no permission beyond the
     *   usage access the student granted in Settings.
     * @param label the app's own display name, e.g. "Spotify".
     */
    fun report(packageName: String?, label: String?): String? {
        if (packageName.isNullOrBlank()) return null

        // Our own screens must not count as an app they chose to use.
        if (packageName == "app.insight.android") return null

        aliases[packageName]?.let { return it }

        val cleaned = clean(label).ifEmpty { clean(packageName.substringAfterLast('.')) }
        if (cleaned.isEmpty()) return null

        return cleaned.take(MAX_NAME_LENGTH)
    }

    /**
     * Strip anything that would leak a path or break the display.
     *
     * A label comes from whoever built the app, so it is treated as untrusted.
     * Whitespace is handled before control characters — a tab is a control
     * character too, and dropping it outright welds two words into one, which
     * the Windows app shipped for an hour before a test caught it.
     */
    fun clean(value: String?): String {
        if (value == null) return ""

        val out = StringBuilder(value.length)
        var lastWasSpace = false

        for (c in value) {
            if (c.isWhitespace()) {
                if (out.isNotEmpty() && !lastWasSpace) out.append(' ')
                lastWasSpace = true
                continue
            }
            if (c.isISOControl()) continue
            if (c == '/' || c == '\\') continue

            out.append(c)
            lastWasSpace = false
        }

        return out.toString().trim()
    }

    /**
     * Does a reported name fall under a blocklist entry?
     *
     * The same rule as `matchesBlocklist` on the server and the matchers in
     * the extension and both desktop apps. All five have to agree, because
     * "blocked" and "counted as a distraction" are meant to be one sentence.
     */
    fun isBlocked(name: String?, blocklist: List<String>): Boolean {
        if (name.isNullOrEmpty()) return false

        val clean = name.lowercase().removePrefix("www.")
        return blocklist.any { clean == it || clean.endsWith(".$it") }
    }
}
