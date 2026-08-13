package app.insight.android

import android.app.ActivityManager
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
    private val blockedEvents = mutableListOf<BlockEvent>()
    private var currentApp: String? = null
    private var currentSince = 0L

    /// Apps the student overrode, cleared when the session ends: an override
    /// is a decision about this session, not a permanent hole in a blocklist.
    private val allowed = mutableSetOf<String>()

    /// Re-opening a blocked app shouldn't file a fresh event every second, or
    /// throw the screen up in a loop.
    private val lastBlockedAt = mutableMapOf<String, Long>()

    /// Kept so a repeat of the same app can be answered without asking the
    /// system again.
    private var previousPackage: String = ""

    /// Whether we've asked for the DNS tunnel.
    ///
    /// This was the crash. `stop()` reaches the VPN service by *starting* it,
    /// and every poll without a focused session called it — so once the app
    /// was in the background, Android refused to start a background service
    /// and threw out of the polling coroutine, killing the process.
    /// START_STICKY brought it back, fifteen seconds later it happened again,
    /// and the phone eventually said "Insight keeps stopping". Now we only ask
    /// to stop something we asked to start.
    private var vpnStarted = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        config = Config(this)
        startForeground(NOTIFICATION_ID, notification("Not studying"))

        job = CoroutineScope(Dispatchers.IO).launch {
            var secondsSinceFlush = 0
            var secondsSincePoll = 0

            while (isActive) {
                // Nothing in here is worth dying for. An exception thrown in a
                // coroutine kills the process, START_STICKY restarts it, and
                // the phone ends up saying "Insight keeps stopping" — which
                // tells a student nothing and costs them every session in
                // between.
                try {
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
                } catch (_: Throwable) {
                    // Try again in a second.
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
        if (vpnStarted) FocusVpnService.stop(this)
        job?.cancel()
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_OVERRIDE) {
            val app = intent.getStringExtra(BlockedActivity.EXTRA_APP)
            val packageName = intent.getStringExtra(BlockedActivity.EXTRA_PACKAGE)

            if (app != null) {
                allowed += app
                blockedEvents += BlockEvent(app, overrideUsed = true)
                CoroutineScope(Dispatchers.IO).launch { flush() }

                // Start it again, since we closed it. An override that left
                // the student to go and find the app themselves would be worse
                // than the block.
                if (packageName != null) {
                    packageManager.getLaunchIntentForPackage(packageName)?.let {
                        startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
            }
        }
        return START_STICKY
    }

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

        val front = foregroundApp()
        val app = front?.second
        if (app == null || app == currentApp) return

        closeSlice()

        if (running.focusMode && app !in allowed && Apps.isBlocked(app, blocklist)) {
            enforce(app, front.first)
            return
        }

        currentApp = app
        currentSince = System.currentTimeMillis()
    }

    /**
     * Put our own screen in front of a blocked app.
     *
     * No entitlement and nobody's approval, which is the whole difference
     * between Android and iPhone here. It needs the overlay permission, which
     * the student granted in Settings and can take back there — and which is
     * also what lets a background service start an activity at all since
     * Android 10.
     *
     * The app is left running. Killing it would lose whatever was in it and
     * feels punitive, and a punitive tool gets uninstalled — at which point it
     * blocks nothing. Same reasoning as the extension redirecting a tab.
     */
    private fun enforce(app: String, packageName: String) {
        val now = System.currentTimeMillis()
        val last = lastBlockedAt[app] ?: 0L

        // The cooldown throttles what gets *recorded*, so re-opening an app
        // ten times doesn't fill a batch with ten identical rows. It no longer
        // throttles the blocking itself: it used to, and that left a
        // thirty-second window where a blocked app opened perfectly.
        if (now - last >= BLOCK_COOLDOWN_MS) {
            lastBlockedAt[app] = now
            blockedEvents += BlockEvent(app, overrideUsed = false)
        }

        startActivity(
            Intent(this, BlockedActivity::class.java)
                .putExtra(BlockedActivity.EXTRA_APP, app)
                .putExtra(BlockedActivity.EXTRA_PACKAGE, packageName)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        )

        // Then close it. Covering an app leaves it running behind the screen,
        // holding its place — so going back to it resumed exactly where it
        // was, and the block read as a curtain rather than a door.
        //
        // Done after our screen is in front, because this only reaches
        // background processes, which is what the blocked app now is. Not a
        // force-stop: that needs privileges no sideloaded app has, and this is
        // enough that reopening starts the app fresh and meets the block
        // again.
        val activityManager = getSystemService(ACTIVITY_SERVICE) as ActivityManager
        try {
            activityManager.killBackgroundProcesses(packageName)
        } catch (_: Exception) {
            // Some apps can't be closed this way — a foreground service of
            // their own, say. The screen is still in front of it, which is the
            // behaviour we had before and is better than nothing.
        }
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
    private fun foregroundApp(): Pair<String, String>? {
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

        val packageName = latest ?: return currentApp?.let { previousPackage to it }
        val reported = Apps.report(packageName, label(packageName)) ?: return null

        // The package comes back too, because closing an app needs its
        // package name and the reported name may be a website's instead.
        previousPackage = packageName
        return packageName to reported
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

        // Every poll rather than every tick: a preferences write once a second
        // is a lot of disk for a heartbeat.
        config.lastTickAt = System.currentTimeMillis()

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
                val changed = previous != null && previous.id != result.session?.id

                // Close the open slice *before* `session` is reassigned.
                // closeSlice() returns early when session is null, so doing it
                // afterwards threw away everything counted since the last
                // flush every time a session ended — which is every session.
                if (changed) closeSlice()

                session = result.session
                blocklist = result.blocklist

                config.sessionRunning = result.session != null
                config.focusMode = result.session?.focusMode == true
                config.blocklistSize = result.blocklist.size

                // A session ended, or a different one began. Either way the
                // tally belongs to the old id, and posting it afterwards loses
                // the last minute of every session.
                if (previous != null && changed) {
                    flush(previous.id)
                    allowed.clear()
                    lastBlockedAt.clear()
                }

                // Site blocking rides with the session: on while Focus Mode is,
                // off the moment it isn't. There is no state where it lingers,
                // which is a good part of what makes it defensible.
                if (result.session?.focusMode == true && blocklist.isNotEmpty()) {
                    FocusVpnService.start(this, blocklist)
                    vpnStarted = true
                } else if (vpnStarted) {
                    FocusVpnService.stop(this)
                    vpnStarted = false
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
        if (!config.paired) return
        if (tally.isEmpty() && blockedEvents.isEmpty()) return

        val sent = tally.toMap()
        val sentBlocked = blockedEvents.toList()
        tally.clear()
        blockedEvents.clear()

        val domains = sent.entries
            .filter { it.value > 0 }
            .sortedByDescending { it.value }
            .take(MAX_DOMAINS)
            .map { DomainTime(it.key, minOf(it.value, 86_400)) }

        if (domains.isEmpty() && sentBlocked.isEmpty()) return

        val ok = api.postActivity(
            config.apiBase, config.token, sessionId, domains, sentBlocked)

        if (!ok) {
            // Put it back, merging with anything counted meanwhile: a dropped
            // connection should delay the data rather than destroy it.
            for ((app, seconds) in sent) tally[app] = (tally[app] ?: 0) + seconds
            blockedEvents.addAll(0, sentBlocked)
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

        /// Long enough that re-opening a blocked app doesn't fill the batch
        /// with identical rows or flicker the screen in a loop.
        private const val BLOCK_COOLDOWN_MS = 30_000L

        const val ACTION_OVERRIDE = "app.insight.android.OVERRIDE"
        const val ACTION_BLOCKED_SITE = "app.insight.android.BLOCKED_SITE"
        const val EXTRA_HOST = "host"

        /// Called from the DNS tunnel when it refuses a lookup, so a blocked
        /// site is recorded exactly like a blocked app.
        fun reportBlockedSite(context: Context, host: String) {
            // Called from the VPN's own thread, where a throw takes the
            // process with it — and starting a service is refused outright
            // when the app is in the background.
            try {
            context.startService(
                Intent(context, TrackerService::class.java)
                    .setAction(ACTION_BLOCKED_SITE)
                    .putExtra(EXTRA_HOST, host)
            )
            } catch (_: Throwable) {
                // The block still happened; only the record of it is lost.
            }
        }

        fun start(context: Context) {
            try {
                context.startForegroundService(Intent(context, TrackerService::class.java))
            } catch (_: Throwable) {
                // Android 12 and later refuse this from the background in
                // several situations, including some paths out of
                // BOOT_COMPLETED. It starts next time the app is opened, and
                // the status screen says when it hasn't been running.
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, TrackerService::class.java))
        }
    }
}
