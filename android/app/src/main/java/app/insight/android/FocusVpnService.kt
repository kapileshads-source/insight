package app.insight.android

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
        blocklist = intent?.getStringArrayListExtra(EXTRA_BLOCKLIST) ?: emptyList()

        if (intent?.action == ACTION_STOP || blocklist.isEmpty()) {
            teardown()
            stopSelf()
            return START_NOT_STICKY
        }

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

        tunnel = try {
            builder.establish()
        } catch (_: Exception) {
            null
        } ?: return

        running = true
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
        private const val TUNNEL_ADDRESS = "10.111.222.1"
        private const val TUNNEL_DNS = "10.111.222.2"
        private const val FALLBACK_DNS = "1.1.1.1"

        const val EXTRA_BLOCKLIST = "blocklist"
        const val ACTION_STOP = "app.insight.android.STOP_VPN"

        /// Null when the student has already agreed; otherwise the intent to
        /// show them, which has to come from an activity.
        fun consentIntent(context: Context): Intent? = prepare(context)

        fun start(context: Context, blocklist: List<String>) {
            if (prepare(context) != null) return  // not agreed to yet

            // Starting a service is refused when the app is in the background,
            // which is most of the time for a tracker. The caller is a
            // foreground service so this is normally allowed — normally is not
            // a good enough reason to risk the process.
            try {
                context.startService(
                    Intent(context, FocusVpnService::class.java)
                        .putStringArrayListExtra(EXTRA_BLOCKLIST, ArrayList(blocklist))
                )
            } catch (_: Throwable) {
                // Site blocking is off for this session. Apps still block.
            }
        }

        fun stop(context: Context) {
            try {
                context.startService(
                    Intent(context, FocusVpnService::class.java).setAction(ACTION_STOP)
                )
            } catch (_: Throwable) {
            }
        }
    }
}
