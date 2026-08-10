package app.insight.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Counts seconds per app while a study session is running.
 *
 * The rules come from the extension by way of the two desktop apps, and this
 * keeps to them:
 *
 *  - Nothing is recorded when no session is running. Not recorded and then
 *    discarded — the timer does not accumulate.
 *  - App names only. Android gives us a package name and a label, and neither
 *    says what was on screen.
 *  - No encryption key here, ever. What this posts lands in a staging table
 *    the server can read, and the student's browser encrypts and deletes it.
 *  - Elapsed time is measured against a stored timestamp, so a phone that
 *    sleeps neither invents nor loses minutes.
 *
 * The Android-specific rule: **nothing counts while the screen is off**. A
 * phone in a pocket still reports a foreground app, and without this a student
 * would be billed for the walk home.
 */
class TrackerService : android.app.Service() {

    private val api = ApiClient()
    private lateinit var config: Config
    private var job: Job? = null

    private var session: SessionState? = null
    private var blocklist: List<String> = emptyList()

    private val tally = mutableMapOf<String, Int>()
    private var currentApp: String? = null
    private var currentSince = 0L

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        config = Config(this)
        startForeground(NOTIFICATION_ID, notification("Not studying"))

        job = CoroutineScope(Dispatchers.IO).launch {
            var secondsSinceFlush = 0
            var secondsSincePoll = 0

            while (isActive) {
                tick()

                secondsSinceFlush++
                secondsSincePoll++

                if (secondsSinceFlush >= FLUSH_EVERY_SECONDS) {
                    secondsSinceFlush = 0
                    secondsSincePoll = 0
                    closeSlice()
                    flush()
                    poll()
                } else if (secondsSincePoll >= POLL_EVERY_SECONDS) {
                    secondsSincePoll = 0
                    poll()
                }

                delay(1_000)
            }
        }
    }

    override fun onDestroy() {
        // Last chance to send what's counted. A session that ends because the
        // student swiped the app away should still keep its final minute.
        closeSlice()
        CoroutineScope(Dispatchers.IO).launch { flush() }
        job?.cancel()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

    // --- counting ------------------------------------------------------------

    private fun tick() {
        val running = session
        if (running == null) {
            currentApp = null
            return
        }

        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!power.isInteractive) {
            // Screen off. A phone in a pocket still names a foreground app,
            // and counting it would bill the walk home as study.
            closeSlice()
            return
        }

        val app = foregroundApp()
        if (app == null || app == currentApp) return

        closeSlice()
        currentApp = app
        currentSince = System.currentTimeMillis()
    }

    private fun closeSlice() {
        val app = currentApp ?: return
        if (session == null) {
            currentApp = null
            return
        }

        val seconds = ((System.currentTimeMillis() - currentSince) / 1000).toInt()
        if (seconds in 1 until MAX_SLICE_SECONDS) {
            tally[app] = (tally[app] ?: 0) + seconds
        }
        currentApp = null
    }

    /**
     * Which app is in front, via usage events.
     *
     * `queryEvents` over the last few seconds rather than `queryUsageStats`,
     * because the aggregated stats round to the nearest interval and lag by
     * minutes — long enough that a student switching apps would see the
     * previous one credited with the next one's time.
     */
    private fun foregroundApp(): String? {
        val usage = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usage.queryEvents(now - 10_000, now)

        var latest: String? = null
        val event = UsageEvents.Event()

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                latest = event.packageName
            }
        }

        val packageName = latest ?: return currentApp
        return Apps.report(packageName, label(packageName))
    }

    private fun label(packageName: String): String? = try {
        val manager = packageManager
        manager.getApplicationLabel(manager.getApplicationInfo(packageName, 0)).toString()
    } catch (_: Exception) {
        null
    }

    // --- sync ----------------------------------------------------------------

    private fun poll() {
        if (!config.paired) return

        val result = api.poll(config.apiBase, config.token)
        when (result.status) {
            PollStatus.UNAUTHORISED -> {
                session = null
                currentApp = null
                update("Unpaired — pair again from Insight")
            }
            PollStatus.UNREACHABLE -> Unit
            PollStatus.OK -> {
                val previous = session
                session = result.session
                blocklist = result.blocklist

                // A session ended, or a different one began. Either way the
                // tally belongs to the old id, and posting it afterwards loses
                // the last minute of every session.
                if (previous != null && previous.id != result.session?.id) {
                    closeSlice()
                    flush(previous.id)
                }

                update(
                    when {
                        result.session == null -> "Not studying"
                        result.session.focusMode -> "Studying, Focus Mode on"
                        else -> "Studying"
                    }
                )
            }
        }
    }

    /**
     * Send the tally and clear it.
     *
     * Taken out of the map before the request and put back on failure, so a
     * dropped connection delays the data rather than destroying it, and
     * seconds counted mid-request aren't lost to a blind clear.
     */
    private fun flush(sessionIdOverride: String? = null) {
        val sessionId = sessionIdOverride ?: session?.id ?: return
        if (!config.paired || tally.isEmpty()) return

        val sent = tally.toMap()
        tally.clear()

        val domains = sent.entries
            .filter { it.value > 0 }
            .sortedByDescending { it.value }
            .take(MAX_DOMAINS)
            .map { DomainTime(it.key, minOf(it.value, 86_400)) }

        if (domains.isEmpty()) return

        val ok = api.postActivity(config.apiBase, config.token, sessionId, domains)
        if (!ok) {
            for ((app, seconds) in sent) tally[app] = (tally[app] ?: 0) + seconds
        }
    }

    // --- the notification Android requires -----------------------------------

    private fun update(text: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification(text))
    }

    private fun notification(text: String): Notification {
        val manager = getSystemService(NotificationManager::class.java)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, "Insight", NotificationManager.IMPORTANCE_LOW)
            )
        }

        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Insight")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.presence_invisible)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val CHANNEL = "insight-tracker"
        private const val NOTIFICATION_ID = 1

        private const val FLUSH_EVERY_SECONDS = 60
        private const val POLL_EVERY_SECONDS = 15

        /// A slice longer than this is a bug or a suspended phone, and either
        /// way it isn't study time.
        private const val MAX_SLICE_SECONDS = 6 * 60 * 60

        /// The endpoint accepts 200 entries; more loses the whole batch.
        private const val MAX_DOMAINS = 200

        fun start(context: Context) {
            context.startForegroundService(Intent(context, TrackerService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackerService::class.java))
        }
    }
}
