package app.insight.android

import android.content.Context

/**
 * The only thing this app keeps: where Insight is, and the pairing token.
 *
 * Not the tally. Counted time lives in memory and is sent every minute, so a
 * phone that is switched off, or picked up by someone who isn't the student,
 * has nothing on it saying which apps they used.
 *
 * Ordinary app-private preferences. Android's sandbox already keeps this out
 * of every other app's reach, and `allowBackup="false"` in the manifest keeps
 * it off Google's servers. Encrypting it with a key stored beside it on the
 * same device would be ceremony rather than protection, the same reasoning
 * that took the Mac app off the keychain.
 */
class Config(context: Context) {
    private val prefs = context.getSharedPreferences("insight", Context.MODE_PRIVATE)

    var apiBase: String
        get() = prefs.getString("apiBase", "") ?: ""
        set(value) = prefs.edit().putString("apiBase", value).apply()

    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(value) = prefs.edit().putString("token", value).apply()

    val paired: Boolean get() = apiBase.isNotEmpty() && token.isNotEmpty()

    /**
     * When the tracker last did anything.
     *
     * Written so the status screen can tell the difference between running and
     * merely installed. The app spent a build claiming everything was fine
     * while nothing was recording, and silence that looks like health is the
     * worst failure available here, an unmeasured hour is indistinguishable
     * from a perfectly focused one once it reaches the insight engine.
     */
    var lastTickAt: Long
        get() = prefs.getLong("lastTickAt", 0L)
        set(value) = prefs.edit().putLong("lastTickAt", value).apply()

    /**
     * What the tracker last saw, written so the status screen can say *why*
     * nothing is being blocked.
     *
     * Blocking has five preconditions and four of them are invisible: a
     * session running, Focus Mode on, a blocklist that isn't empty, and two
     * permissions granted in Settings. "It isn't blocking" was impossible to
     * diagnose from the outside, and guessing at someone else's phone is a
     * poor way to spend an evening.
     */
    var sessionRunning: Boolean
        get() = prefs.getBoolean("sessionRunning", false)
        set(value) = prefs.edit().putBoolean("sessionRunning", value).apply()

    var focusMode: Boolean
        get() = prefs.getBoolean("focusMode", false)
        set(value) = prefs.edit().putBoolean("focusMode", value).apply()

    var blocklistSize: Int
        get() = prefs.getInt("blocklistSize", 0)
        set(value) = prefs.edit().putInt("blocklistSize", value).apply()

    /**
     * Whether the DNS tunnel is actually established.
     *
     * Distinct from having permission for one. "You allowed a VPN" and "a VPN
     * is running" are different sentences, and the status screen was showing
     * the first while a student read it as the second.
     */
    var siteBlockingActive: Boolean
        get() = prefs.getBoolean("siteBlockingActive", false)
        set(value) = prefs.edit().putBoolean("siteBlockingActive", value).apply()

    /**
     * Why the DNS tunnel isn't running, when it should be.
     *
     * There are four places it can fail, consent, starting the service,
     * establishing the tunnel, and the loop that reads it, and from outside
     * they look identical. Guessing which one cost two rounds of "try this",
     * so each now records what actually happened.
     */
    var siteBlockingProblem: String?
        get() = prefs.getString("siteBlockingProblem", null)
        set(value) = prefs.edit().putString("siteBlockingProblem", value).apply()

    /**
     * The last crash, so a screenshot of the status screen is enough to fix
     * it. Android tells a student "Insight keeps stopping" and nothing else,
     * and a stack trace otherwise needs a cable and a laptop.
     */
    val lastCrash: String? get() = prefs.getString("lastCrash", null)

    fun clearCrash() = prefs.edit().remove("lastCrash").remove("lastCrashAt").apply()

    /** Unpairing leaves nothing behind, the same as the extension's popup. */
    fun clear() = prefs.edit().clear().apply()
}
