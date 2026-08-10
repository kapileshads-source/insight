package app.insight.android

import java.net.URI

/**
 * Whether an Insight address is safe to send a pairing code to.
 *
 * Mirrors `windows/Address.cs` and `mac/Sources/Insight/Address.swift`: https
 * anywhere, plain http only to a local address. Over cleartext the pairing
 * code and then every app name from every session cross the network readable
 * by anyone else on the school's wifi, and a student typing "http" out of
 * habit is not making an informed choice about that.
 *
 * Android also refuses cleartext by default at the platform level, so an http
 * address to the open internet would fail anyway — but as "couldn't reach",
 * which sends someone to check their wifi over a problem no wifi will fix.
 */
object Address {

    fun problem(input: String): String? {
        val uri = try {
            URI(input.trim())
        } catch (_: Exception) {
            return "That doesn't look like a web address."
        }

        val scheme = uri.scheme?.lowercase()
        val host = uri.host ?: return "That doesn't look like a web address."

        if (scheme == "https") return null
        if (scheme != "http") return "The address should start with https://"

        if (isLocal(host)) return null

        return "That address isn't secure. Use https:// — over plain http your " +
            "pairing code and everything this app records could be read by " +
            "anyone else on the network."
    }

    private fun isLocal(host: String): Boolean {
        val name = host.lowercase().trim('[', ']')

        if (name == "localhost" || name == "::1") return true
        if (name.endsWith(".local")) return true

        val parts = name.split(".")
        if (parts.size != 4) return false

        val octets = parts.map { it.toIntOrNull() ?: return false }
        if (octets.any { it !in 0..255 }) return false

        // 127/8, 10/8, 172.16/12, 192.168/16, and 169.254/16 for link-local.
        return when (octets[0]) {
            127, 10 -> true
            172 -> octets[1] in 16..31
            192 -> octets[1] == 168
            169 -> octets[1] == 254
            else -> false
        }
    }
}
