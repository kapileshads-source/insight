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
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
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

        try {
            startForeground(NOTIFICATION_ID, notification())
        } catch (e: Throwable) {
            // Notifications may be refused outright on Android 13+, and a
            // foreground service that can't show one is a service Android may
            // refuse to keep.
            config.siteBlockingProblem = "5. couldn't go foreground: ${e.javaClass.simpleName}"
        }

        blocklist = intent?.getStringArrayListExtra(EXTRA_BLOCKLIST) ?: emptyList()
        config.siteBlockingProblem = "6. blocklist of ${blocklist.size}"

        if (intent?.action == ACTION_STOP || blocklist.isEmpty()) {
            if (intent?.action != ACTION_STOP) {
                // Android restarts a sticky service with a null intent, which
                // is how the blocklist can arrive empty without anyone doing
                // anything wrong.
                config.siteBlockingProblem = "7. started with no blocklist"
            }
            teardown()
            stopSelf()
            return START_NOT_STICKY
        }

        config.siteBlockingProblem = "8. establishing the tunnel"

        if (!running) connect()
        return START_STICKY
    }

    override fun onDestroy() {
        teardown()
        super.onDestroy()
    }

    override fun onRevoke() {
        // The student turned the VPN off from Settings, which is their right
        // and needs no argument from us.
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
            // packet was involved.
            try {
                pump()
            } catch (_: Throwable) {
                teardown()
            }
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
     * Deliberately sequential. A study phone makes a handful of lookups a
     * second, and a thread pool here would buy nothing but ways to be wrong.
     */
    private fun pump() {
        val descriptor = tunnel?.fileDescriptor ?: return
        val input = FileInputStream(descriptor)
        val output = FileOutputStream(descriptor)
        val buffer = ByteArray(32_767)

        val upstream = DatagramSocket().apply {
            soTimeout = 5_000
            // Without this the forwarded query would be routed back into our
            // own tunnel, which is a loop that ends in every lookup timing out.
            protect(this)
        }

        val resolver = upstreamResolver()

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
                try {
                    output.write(Dns.refusal(query))
                } catch (_: Exception) {
                    break
                }
                TrackerService.reportBlockedSite(this, host)
                continue
            }

            // Not blocked: ask the real resolver and hand back whatever it
            // says, unread and unrecorded.
            try {
                upstream.send(
                    DatagramPacket(query.payload, query.payload.size, resolver, Dns.PORT)
                )

                val reply = ByteArray(4_096)
                val packet = DatagramPacket(reply, reply.size)
                upstream.receive(packet)

                output.write(Dns.wrap(query, reply.copyOf(packet.length)))
            } catch (_: Exception) {
                // A lookup that times out is a lookup the app will retry.
                // Better that than tearing the tunnel down over one packet.
            }
        }

        upstream.close()
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
        val manager = getSystemService(ConnectivityManager::class.java)
        val network = manager?.activeNetwork
        val properties = network?.let { manager.getLinkProperties(it) }

        val system = properties?.dnsServers?.firstOrNull { it.address.size == 4 }
        return system ?: InetAddress.getByName(FALLBACK_DNS)
    }

    companion object {
        private const val CHANNEL = "insight-sites"
        private const val NOTIFICATION_ID = 2

        private const val TUNNEL_ADDRESS = "10.111.222.1"
        private const val TUNNEL_DNS = "10.111.222.2"
        private const val FALLBACK_DNS = "1.1.1.1"

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
                Config(context).siteBlockingProblem =
                    "Couldn't start the blocker: ${e.javaClass.simpleName}"
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
