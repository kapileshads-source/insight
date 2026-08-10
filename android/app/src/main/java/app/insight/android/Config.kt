package app.insight.android

import android.content.Context

/**
 * The only thing this app keeps: where Insight is, and the pairing token.
 *
 * Not the tally. Counted time lives in memory and is sent every minute, so a
 * phone that is switched off — or picked up by someone who isn't the student —
 * has nothing on it saying which apps they used.
 *
 * Ordinary app-private preferences. Android's sandbox already keeps this out
 * of every other app's reach, and `allowBackup="false"` in the manifest keeps
 * it off Google's servers. Encrypting it with a key stored beside it on the
 * same device would be ceremony rather than protection — the same reasoning
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
     * worst failure available here — an unmeasured hour is indistinguishable
     * from a perfectly focused one once it reaches the insight engine.
     */
    var lastTickAt: Long
        get() = prefs.getLong("lastTickAt", 0L)
        set(value) = prefs.edit().putLong("lastTickAt", value).apply()

    /** Unpairing leaves nothing behind, the same as the extension's popup. */
    fun clear() = prefs.edit().clear().apply()
}
