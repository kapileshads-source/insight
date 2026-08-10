package app.insight.android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Start the tracker again after the phone reboots.
 *
 * Without this, a paired student who restarts their phone gets an app that
 * looks paired and records nothing until they next open it. A gap in the data
 * is worse than no data: an hour nobody measured is indistinguishable from an
 * hour of perfect focus, and the insight engine would quietly treat it as one.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!Config(context).paired) return

        // TrackerService.start swallows the refusal Android 12+ can throw
        // here; the app starts it again next time it's opened.
        TrackerService.start(context)
    }
}
