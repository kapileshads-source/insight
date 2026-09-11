package app.insight.android

import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

data class SessionState(val id: String, val startedAtMillis: Long, val focusMode: Boolean)

enum class PollStatus { OK, UNAUTHORISED, UNREACHABLE }

data class PollResult(
    val status: PollStatus,
    val session: SessionState?,
    val blocklist: List<String>,
)

data class DomainTime(val domain: String, val seconds: Int)

data class BlockEvent(val site: String, val overrideUsed: Boolean)

/**
 * The two endpoints, over the platform's own HTTP client.
 *
 * No library: this is two calls, and a dependency is a thing to keep current
 * on a phone holding a student's pairing token.
 */
class ApiClient {

    fun poll(base: String, token: String): PollResult {
        return try {
            val connection = open("$base/api/devices/session", token, "GET")

            when (val code = connection.responseCode) {
                401 -> PollResult(PollStatus.UNAUTHORISED, null, emptyList())
                in 200..299 -> parse(connection.inputStream.bufferedReader().use(BufferedReader::readText))
                else -> {
                    @Suppress("UNUSED_EXPRESSION") code
                    PollResult(PollStatus.UNREACHABLE, null, emptyList())
                }
            }
        } catch (_: Exception) {
            PollResult(PollStatus.UNREACHABLE, null, emptyList())
        }
    }

    /**
     * Report what was used. App names go in the `domain` field, which is what
     * the endpoint's author intended for the native apps.
     *
     * Returns false on anything but a clean success, and the caller keeps its
     * tally, a dropped connection should delay the data, not destroy it.
     */
    fun postActivity(
        base: String,
        token: String,
        sessionId: String,
        domains: List<DomainTime>,
        blocked: List<BlockEvent> = emptyList(),
    ): Boolean {
        return try {
            val body = JSONObject().apply {
                put("sessionId", sessionId)
                put("domains", domains.fold(org.json.JSONArray()) { array, d ->
                    array.put(JSONObject().put("domain", d.domain).put("seconds", d.seconds))
                })
                put("blocked", blocked.fold(org.json.JSONArray()) { array, b ->
                    array.put(
                        JSONObject().put("site", b.site).put("overrideUsed", b.overrideUsed)
                    )
                })
            }

            val connection = open("$base/api/devices/activity", token, "POST")
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            connection.responseCode in 200..299
        } catch (_: Exception) {
            false
        }
    }

    private fun open(url: String, token: String, method: String): HttpURLConnection =
        (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("User-Agent", "Insight-Android/0.1")
            connectTimeout = 15_000
            readTimeout = 15_000
        }

    companion object {
        /// Split out so it can be tested without a network.
        fun parse(body: String): PollResult {
            val root = try {
                JSONObject(body)
            } catch (_: Exception) {
                return PollResult(PollStatus.OK, null, emptyList())
            }

            val session = root.optJSONObject("session")?.let {
                val id = it.optString("id")
                if (id.isEmpty()) null
                else SessionState(
                    id = id,
                    startedAtMillis = parseIso(it.optString("startedAt")),
                    focusMode = it.optBoolean("focusMode", false),
                )
            }

            val list = root.optJSONArray("blocklist")
            val blocklist = buildList {
                for (i in 0 until (list?.length() ?: 0)) {
                    val entry = list?.optString(i).orEmpty()
                    if (entry.isNotBlank()) add(entry.lowercase())
                }
            }

            return PollResult(PollStatus.OK, session, blocklist)
        }

        /// `toISOString()` always has milliseconds, but a parser that only
        /// accepts them fails silently, and a bad start time reads as a
        /// session that began just now, making every "started N minutes ago"
        /// wrong.
        private fun parseIso(value: String): Long {
            if (value.isEmpty()) return System.currentTimeMillis()

            return try {
                java.time.Instant.parse(value).toEpochMilli()
            } catch (_: Exception) {
                System.currentTimeMillis()
            }
        }
    }
}
