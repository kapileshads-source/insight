package app.insight.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.Executors
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Blocks *sites* on the phone, which nothing else here can do.
 *
 * The extension blocks sites on a laptop; Chrome for Android can't run it. So
 * the only remaining place to say no to `youtube.com` is the lookup itself: a
 * local VPN that carries nothing but DNS, answers "no such name" for anything
 * on the student's blocklist, and forwards everything else untouched.
 *
 * Three things make this defensible rather than creepy, and all three are
 * enforced here rather than promised:
 *
 *  - **It runs only while a session is running with Focus Mode on.** The
 *    tracker starts it and stops it; there is no state where it lingers.
 *  - **Only DNS goes through it.** The tunnel routes one address — the
 *    resolver we advertise. Web traffic, messages and everything else never
 *    enter this process.
 *  - **Nothing is recorded.** Blocked names are counted as block events like
 *    any other; allowed names are forwarded and forgotten, never written down.
 *
 * The honest limitation: a browser using DNS-over-HTTPS never asks us. Chrome
 * turns Secure DNS off while a VPN is active in most configurations, but not
 * all — so this is friction rather than a wall, like everything else here.
 */
class FocusVpnService : VpnService() {

    private var tunnel: ParcelFileDescriptor? = null
    private var worker: Thread? = null
    @Volatile private var blocklist: List<String> = emptyList()
    @Volatile private var running = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // A foreground service, because Android refuses to *start* a
        // background one while the app is in the background — which is
        // always, for a tracker. That refusal used to crash the app; then it
        // was swallowed, and site blocking simply never happened. Neither is
        // acceptable, so the service is one Android will allow.
        val config = Config(this)
        config.siteBlockingProblem = "4. service running"

        // A recorded failure has to outlive the progress crumbs that follow
        // it. The first version overwrote step 5 with step 6 on the very next
        // line, so the one message that named a cause was the one message
        // nobody could ever see.
        var failure: String? = null

        try {
            startForeground(NOTIFICATION_ID, notification())
        } catch (e: Throwable) {
            // Notifications may be refused outright on Android 13+, and a
            // foreground service that can't show one is a service Android may
            // refuse to keep.
            failure = "5. couldn't go foreground: ${e.javaClass.simpleName}: ${e.message}"
        }

        blocklist = intent?.getStringArrayListExtra(EXTRA_BLOCKLIST) ?: emptyList()
        config.siteBlockingProblem = failure ?: "6. blocklist of ${blocklist.size}"

        if (intent?.action == ACTION_STOP || blocklist.isEmpty()) {
            if (intent?.action != ACTION_STOP) {
                // Android restarts a sticky service with a null intent, which
                // is how the blocklist can arrive empty without anyone doing
                // anything wrong.
                config.siteBlockingProblem = failure ?: "7. started with no blocklist"
            }
            teardown()
            stopSelf()
            return START_NOT_STICKY
        }

        config.siteBlockingProblem = failure ?: "8. establishing the tunnel"

        if (running) {
            // The tracker re-sends this every poll. Leaving the last crumb
            // behind meant a working tunnel reported "8. establishing" for the
            // rest of the session — a breadcrumb trail that outlived the walk.
            config.siteBlockingProblem = failure
        } else {
            connect()
        }
        return START_STICKY
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }

    override fun onRevoke() {
        // The student turned the VPN off from Settings, which is their right
        // and needs no argument from us — but "another VPN took the slot"
        // lands here too, and looks identical from the outside.
        Log.i(TAG, "onRevoke")
        Config(this).siteBlockingProblem =
            "Android withdrew the tunnel — another VPN may have taken over."
        teardown()
        super.onRevoke()
    }

    private fun connect() {
        val builder = Builder()
            .setSession("Insight Focus Mode")
            .addAddress(TUNNEL_ADDRESS, 32)
            .addDnsServer(TUNNEL_DNS)
            // The single most important line: only the resolver we advertise
            // is routed into this process. Nothing else the phone does —
            // pages, messages, video — passes through Insight.
            .addRoute(TUNNEL_DNS, 32)
            .setBlocking(true)
            .setConfigureIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE,
                )
            )

        val config = Config(this)

        tunnel = try {
            builder.establish()
        } catch (e: Throwable) {
            config.siteBlockingProblem = "Android refused the tunnel: ${e.javaClass.simpleName}"
            null
        }

        if (tunnel == null) {
            // establish() returns null rather than throwing when consent has
            // been revoked, or when another VPN holds the one slot Android
            // allows. Silence here is what made this so hard to chase.
            if (config.siteBlockingProblem == null) {
                config.siteBlockingProblem =
                    "Android wouldn't create the tunnel. Another VPN may hold the slot, " +
                        "or permission was withdrawn in Settings."
            }
            return
        }

        config.siteBlockingProblem = null

        running = true
        config.siteBlockingActive = true
        worker = thread(name = "insight-dns") {
            // An uncaught exception on this thread kills the whole app, and a
            // student sees "Insight keeps stopping" with no clue that a DNS
            // packet was involved. Catching it was right; discarding it was
            // not. The tunnel established, this thread died on its first
            // instruction, and the only trace was a boolean going false.
            try {
                pump()
                if (running) config.siteBlockingProblem = "The tunnel closed on its own."
            } catch (e: Throwable) {
                // `running` goes false in teardown() before the interrupt that
                // lands here, so this is how a deliberate stop is told apart
                // from a failure. Without it, every session that ended tidily
                // reported InterruptedException as a problem.
                if (running) {
                    Log.e(TAG, "pump threw", e)
                    config.siteBlockingProblem =
                        "The tunnel opened but stopped: ${e.javaClass.simpleName}: ${e.message}"
                } else {
                    Log.i(TAG, "tunnel closed on request")
                    config.siteBlockingProblem = null
                }
            }
            teardown()
        }
    }

    private fun teardown() {
        running = false
        try {
            Config(this).siteBlockingActive = false
        } catch (_: Throwable) {
        }
        worker?.interrupt()
        worker = null
        try {
            tunnel?.close()
        } catch (_: Exception) {
        }
        tunnel = null
    }

    /**
     * Read queries, refuse the blocked ones, forward the rest.
     *
     * Every forwarded query gets its own socket and its own thread. The first
     * version shared one socket and handled queries strictly in turn — send,
     * block until *a* reply arrives, assume it belongs to the query we just
     * sent. Android's resolver asks for A and AAAA at once, several hostnames
     * per page, so replies interleave. Each one was then delivered to the port
     * of whichever query we happened to be waiting on, and after the first
     * mismatch every answer went to the wrong asker.
     *
     * Because this tunnel advertises itself as the phone's only resolver, that
     * wasn't slow browsing. It was a phone that could not resolve anything.
     */
    private fun pump() {
        val descriptor = tunnel?.fileDescriptor ?: return
        val input = FileInputStream(descriptor)
        val output = FileOutputStream(descriptor)
        val buffer = ByteArray(32_767)

        val resolver = upstreamResolver()
        Log.i(TAG, "pump ready, upstream=$resolver")

        // Bounded on purpose. A page can ask for dozens of names at once, and
        // a thread each would be worse than the bug this replaces.
        val forwarders = Executors.newFixedThreadPool(8) as ThreadPoolExecutor
        val consecutiveFailures = AtomicInteger(0)

        while (running && !Thread.currentThread().isInterrupted) {
            val read = try {
                input.read(buffer)
            } catch (_: Exception) {
                break
            }
            if (read <= 0) continue

            val query = Dns.parseIPv4Udp(buffer, read) ?: continue
            if (query.destinationPort != Dns.PORT) continue

            val host = Dns.questionName(query.payload)

            if (host != null && Apps.isBlocked(host, blocklist)) {
                if (!reply(output, Dns.refusal(query))) break
                TrackerService.reportBlockedSite(this, host)
                continue
            }

            // Not blocked: ask the real resolver and hand back whatever it
            // says, unread and unrecorded.
            try {
                forwarders.execute { forward(query, resolver, output, consecutiveFailures) }
            } catch (_: Throwable) {
                // The queue is full, which means the resolver is not answering.
                // Dropping is the honest response; the client will retry.
            }
        }

        forwarders.shutdownNow()
        forwarders.awaitTermination(2, TimeUnit.SECONDS)
    }

    /**
     * One forwarded lookup, start to finish, on its own socket.
     *
     * Its own socket rather than a shared one: a socket per query is what
     * makes "the reply I receive is the reply to the query I sent" true rather
     * than hoped for.
     */
    private fun forward(
        query: Dns.Packet,
        resolver: InetAddress,
        output: FileOutputStream,
        consecutiveFailures: AtomicInteger,
    ) {
        val socket = try {
            DatagramSocket().apply {
                soTimeout = 5_000
                // Without this the forwarded query would be routed back into
                // our own tunnel, a loop that ends in every lookup timing out.
                protect(this)
            }
        } catch (e: Throwable) {
            Log.e(TAG, "couldn't open a socket to forward with", e)
            failOpenIfHopeless(consecutiveFailures.incrementAndGet())
            return
        }

        try {
            socket.send(DatagramPacket(query.payload, query.payload.size, resolver, Dns.PORT))

            val reply = ByteArray(4_096)
            val packet = DatagramPacket(reply, reply.size)
            socket.receive(packet)

            consecutiveFailures.set(0)
            reply(output, Dns.wrap(query, reply.copyOf(packet.length)))
        } catch (_: Exception) {
            // A lookup that times out is a lookup the client will retry.
            failOpenIfHopeless(consecutiveFailures.incrementAndGet())
        } finally {
            socket.close()
        }
    }

    /**
     * Get out of the way when we are plainly the problem.
     *
     * A student whose phone cannot resolve anything does not care which of our
     * components is at fault, and they may be in the middle of something that
     * matters. Handing DNS back is always safer than holding on to it: the
     * worst case is an unblocked session, and the alternative is a phone that
     * doesn't work.
     */
    private fun failOpenIfHopeless(failures: Int) {
        if (failures < FAIL_OPEN_AFTER || !running) return

        Log.e(TAG, "$failures lookups failed in a row; handing DNS back")
        Config(this).siteBlockingProblem =
            "Site blocking stopped: lookups weren't getting through, so the " +
                "phone's normal DNS was handed back."
        teardown()
    }

    /** Writes to the tunnel are shared state; every reply goes through here. */
    private fun reply(output: FileOutputStream, packet: ByteArray): Boolean =
        synchronized(output) {
            try {
                output.write(packet)
                true
            } catch (_: Exception) {
                false
            }
        }

    private fun notification(): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Website blocking", NotificationManager.IMPORTANCE_LOW)
        )

        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Insight")
            .setContentText("Blocking websites during this session")
            .setSmallIcon(android.R.drawable.presence_invisible)
            .setOngoing(true)
            .build()
    }

    /**
     * The resolver the phone would have used anyway.
     *
     * Sending everything to a public resolver instead would quietly move every
     * lookup a student makes to a company they didn't choose — a bigger change
     * to their privacy than the blocking is worth.
     */
    private fun upstreamResolver(): InetAddress {
        // Defensive because this ran inside a thread whose only error handling
        // was to disappear: asking the system for its resolver needs a
        // permission, and a missing one throws rather than returns null.
        val system = try {
            val manager = getSystemService(ConnectivityManager::class.java)
            val network = manager?.activeNetwork
            val properties = network?.let { manager.getLinkProperties(it) }
            properties?.dnsServers?.firstOrNull { it.address.size == 4 }
        } catch (e: Throwable) {
            Log.e(TAG, "couldn't read the system resolver", e)
            null
        }

        if (system == null) {
            // Worth saying out loud rather than falling back quietly: every
            // lookup this session goes somewhere the student didn't pick.
            Config(this).siteBlockingProblem =
                "Using a public resolver — the phone's own couldn't be read."
        }

        return system ?: InetAddress.getByName(FALLBACK_DNS)
    }

    companion object {
        private const val TAG = "InsightVpn"
        private const val CHANNEL = "insight-sites"
        private const val NOTIFICATION_ID = 2

        private const val TUNNEL_ADDRESS = "10.111.222.1"
        private const val TUNNEL_DNS = "10.111.222.2"
        private const val FALLBACK_DNS = "1.1.1.1"

        /// Enough retries to ride out a change of network, few enough that a
        /// broken tunnel doesn't cost a student their afternoon.
        private const val FAIL_OPEN_AFTER = 12

        const val EXTRA_BLOCKLIST = "blocklist"
        const val ACTION_STOP = "app.insight.android.STOP_VPN"

        /// Null when the student has already agreed; otherwise the intent to
        /// show them, which has to come from an activity.
        fun consentIntent(context: Context): Intent? = prepare(context)

        fun start(context: Context, blocklist: List<String>) {
            val config = Config(context)
            config.siteBlockingProblem = "1. asked to start"

            if (prepare(context) != null) {
                config.siteBlockingProblem =
                    "Insight needs the VPN permission again — allow it above."
                return
            }

            // Starting a service is refused when the app is in the background,
            // which is most of the time for a tracker. The caller is a
            // foreground service so this is normally allowed — normally is not
            // a good enough reason to risk the process.
            try {
                config.siteBlockingProblem = "2. starting the service"
                context.startForegroundService(
                    Intent(context, FocusVpnService::class.java)
                        .putStringArrayListExtra(EXTRA_BLOCKLIST, ArrayList(blocklist))
                )
                config.siteBlockingProblem = "3. Android accepted the start"
            } catch (e: Throwable) {
                // Site blocking is off for this session. Apps still block, and
                // the status screen now says which is which and why.
                config.siteBlockingProblem =
                    "Couldn't start the blocker: ${e.javaClass.simpleName}: ${e.message}"
            }
        }

        fun stop(context: Context) {
            try {
                context.startForegroundService(
                    Intent(context, FocusVpnService::class.java).setAction(ACTION_STOP)
                )
            } catch (_: Throwable) {
            }
        }
    }
}
