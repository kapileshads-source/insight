package app.insight.android

import java.nio.ByteBuffer

/**
 * Just enough of DNS and IPv4 to answer "no" to a hostname.
 *
 * The phone's own browser can't run our extension, so the only way to block a
 * *site* rather than a whole app is to refuse the lookup. That means reading
 * DNS queries off a local VPN tunnel, which sounds invasive and is in fact
 * the least invasive option available: a hostname the phone was already
 * about to ask a public resolver for, seen only while a session is running,
 * and recorded only when it's one the student chose to block.
 *
 * Everything here is pure and tested. Packet parsing that is nearly right
 * fails in ways that look like the network being flaky, which is the hardest
 * kind of bug to attribute.
 */
object Dns {

    const val PROTOCOL_UDP = 17
    const val PORT = 53

    data class Packet(
        val sourceIp: ByteArray,
        val destinationIp: ByteArray,
        val sourcePort: Int,
        val destinationPort: Int,
        val payload: ByteArray,
        val headerLength: Int,
    )

    /**
     * Pull the UDP payload out of an IPv4 packet, or null if it isn't one we
     * handle. IPv6 is not parsed: the tunnel is built without an IPv6 address,
     * so nothing arrives on it.
     */
    fun parseIPv4Udp(data: ByteArray, length: Int): Packet? {
        if (length < 28) return null

        val version = (data[0].toInt() ushr 4) and 0xF
        if (version != 4) return null

        val headerLength = (data[0].toInt() and 0xF) * 4
        if (headerLength < 20 || length < headerLength + 8) return null
        if ((data[9].toInt() and 0xFF) != PROTOCOL_UDP) return null

        val sourceIp = data.copyOfRange(12, 16)
        val destinationIp = data.copyOfRange(16, 20)

        val sourcePort = readShort(data, headerLength)
        val destinationPort = readShort(data, headerLength + 2)
        val udpLength = readShort(data, headerLength + 4)

        val payloadLength = udpLength - 8
        val payloadStart = headerLength + 8
        if (payloadLength < 0 || payloadStart + payloadLength > length) return null

        return Packet(
            sourceIp = sourceIp,
            destinationIp = destinationIp,
            sourcePort = sourcePort,
            destinationPort = destinationPort,
            payload = data.copyOfRange(payloadStart, payloadStart + payloadLength),
            headerLength = headerLength,
        )
    }

    /**
     * The hostname a DNS query is asking about, lowercased and without the
     * trailing dot. Null for anything that isn't a single ordinary question.
     */
    fun questionName(dns: ByteArray): String? {
        if (dns.size < 13) return null

        // Header: id, flags, qdcount, ancount, nscount, arcount.
        val questions = readShort(dns, 4)
        if (questions != 1) return null

        val name = StringBuilder()
        var index = 12

        while (index < dns.size) {
            val length = dns[index].toInt() and 0xFF
            if (length == 0) break

            // A pointer in a question is malformed; refusing to follow one is
            // also what stops a crafted packet walking us around the buffer.
            if (length and 0xC0 != 0) return null

            index++
            if (index + length > dns.size) return null

            if (name.isNotEmpty()) name.append('.')
            name.append(String(dns, index, length, Charsets.US_ASCII))
            index += length
        }

        val host = name.toString().lowercase()
        return host.ifEmpty { null }
    }

    /**
     * An answer meaning "there is no such name", addressed back to whoever
     * asked. NXDOMAIN rather than an address pointing nowhere: a browser shows
     * "can't find the server" quickly instead of hanging on a connection to an
     * address that will never answer.
     */
    fun refusal(query: Packet): ByteArray {
        val dns = query.payload
        if (dns.size < 12) return ByteArray(0)

        // Question section: everything after the header up to and including
        // the type and class that follow the name.
        var index = 12
        while (index < dns.size) {
            val length = dns[index].toInt() and 0xFF
            index++
            if (length == 0) break
            index += length
        }
        val questionEnd = minOf(index + 4, dns.size)

        val response = ByteArray(questionEnd)
        System.arraycopy(dns, 0, response, 0, questionEnd)

        // QR=1 (this is a response), RA=1, RCODE=3 (no such name).
        response[2] = (dns[2].toInt() or 0x80).toByte()
        response[3] = 0x83.toByte()
        // One question, no answers of any kind.
        response[6] = 0; response[7] = 0
        response[8] = 0; response[9] = 0
        response[10] = 0; response[11] = 0

        return wrap(query, response)
    }

    /**
     * Put a DNS payload back into an IPv4/UDP packet, with the addresses and
     * ports swapped so it reaches whoever asked.
     */
    fun wrap(query: Packet, payload: ByteArray): ByteArray {
        val total = 20 + 8 + payload.size
        val buffer = ByteBuffer.allocate(total)

        buffer.put(0x45)                        // IPv4, 5 words of header
        buffer.put(0)                           // no special handling
        buffer.putShort(total.toShort())
        buffer.putShort(0)                      // id
        buffer.putShort(0)                      // no fragmenting
        buffer.put(64)                          // time to live
        buffer.put(PROTOCOL_UDP.toByte())
        buffer.putShort(0)                      // checksum, filled in below
        buffer.put(query.destinationIp)         // from the server they asked
        buffer.put(query.sourceIp)              // to the app that asked

        buffer.putShort(query.destinationPort.toShort())
        buffer.putShort(query.sourcePort.toShort())
        buffer.putShort((8 + payload.size).toShort())
        // Zero means "not computed", which IPv4 allows for UDP and which
        // saves recomputing a pseudo-header checksum for every reply.
        buffer.putShort(0)

        buffer.put(payload)

        val packet = buffer.array()
        val checksum = headerChecksum(packet)
        packet[10] = (checksum ushr 8).toByte()
        packet[11] = checksum.toByte()

        return packet
    }

    /** The IPv4 header checksum, which is not optional. */
    fun headerChecksum(packet: ByteArray): Int {
        var sum = 0
        var i = 0
        while (i < 20) {
            if (i == 10) { i += 2; continue }  // the checksum field itself
            sum += ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
            i += 2
        }
        while (sum shr 16 != 0) sum = (sum and 0xFFFF) + (sum shr 16)
        return sum.inv() and 0xFFFF
    }

    private fun readShort(data: ByteArray, offset: Int): Int =
        ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
}
