package app.insight.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Packet parsing that is nearly right fails like flaky wifi, which is the
 * hardest kind of bug to attribute — a student would blame the school's
 * network, or Insight, and never the byte offsets.
 */
class DnsTest {

    /** A real-shaped IPv4/UDP DNS query for a hostname. */
    private fun query(host: String, sourcePort: Int = 40000): ByteArray {
        val labels = host.split(".")
        val name = mutableListOf<Byte>()
        for (label in labels) {
            name.add(label.length.toByte())
            name.addAll(label.toByteArray(Charsets.US_ASCII).toList())
        }
        name.add(0)

        val dns = mutableListOf<Byte>()
        dns.addAll(listOf(0x12, 0x34).map { it.toByte() })   // id
        dns.addAll(listOf(0x01, 0x00).map { it.toByte() })   // standard query
        dns.addAll(listOf(0x00, 0x01).map { it.toByte() })   // one question
        dns.addAll(List(6) { 0.toByte() })                   // no answers
        dns.addAll(name)
        dns.addAll(listOf(0x00, 0x01).map { it.toByte() })   // type A
        dns.addAll(listOf(0x00, 0x01).map { it.toByte() })   // class IN

        val udpLength = 8 + dns.size
        val total = 20 + udpLength

        val packet = mutableListOf<Byte>()
        packet.add(0x45); packet.add(0)
        packet.add((total shr 8).toByte()); packet.add(total.toByte())
        packet.addAll(List(4) { 0.toByte() })
        packet.add(64); packet.add(17)
        packet.add(0); packet.add(0)
        packet.addAll(listOf(10, 111, 222, 1).map { it.toByte() })   // from the phone
        packet.addAll(listOf(10, 111, 222, 2).map { it.toByte() })   // to our resolver

        packet.add((sourcePort shr 8).toByte()); packet.add(sourcePort.toByte())
        packet.add(0); packet.add(53)
        packet.add((udpLength shr 8).toByte()); packet.add(udpLength.toByte())
        packet.add(0); packet.add(0)
        packet.addAll(dns)

        return packet.toByteArray()
    }

    @Test
    fun `a query is parsed and its hostname read`() {
        val data = query("youtube.com")
        val parsed = Dns.parseIPv4Udp(data, data.size)

        assertNotNull(parsed)
        assertEquals(53, parsed!!.destinationPort)
        assertEquals(40000, parsed.sourcePort)
        assertEquals("youtube.com", Dns.questionName(parsed.payload))
    }

    @Test
    fun `subdomains come through whole, so the blocklist can match them`() {
        val data = query("music.youtube.com")
        val parsed = Dns.parseIPv4Udp(data, data.size)!!

        assertEquals("music.youtube.com", Dns.questionName(parsed.payload))
        assertTrue(Apps.isBlocked(Dns.questionName(parsed.payload), listOf("youtube.com")))
    }

    @Test
    fun `hostnames are lowercased, because DNS is not case sensitive`() {
        val data = query("YouTube.COM")
        val parsed = Dns.parseIPv4Udp(data, data.size)!!
        assertEquals("youtube.com", Dns.questionName(parsed.payload))
    }

    @Test
    fun `rubbish is refused rather than misread`() {
        assertNull(Dns.parseIPv4Udp(ByteArray(10), 10))
        assertNull(Dns.parseIPv4Udp(ByteArray(64), 64))          // version 0
        assertNull(Dns.questionName(ByteArray(4)))

        // A truncated packet: the header claims more than arrived.
        val data = query("youtube.com")
        assertNull(Dns.parseIPv4Udp(data, 24))
    }

    @Test
    fun `a compression pointer in a question is refused`() {
        // Not legal in a question, and following one is how a crafted packet
        // would walk us around the buffer.
        val dns = ByteArray(20)
        dns[5] = 1                       // one question
        dns[12] = 0xC0.toByte()          // a pointer where a length belongs
        assertNull(Dns.questionName(dns))
    }

    @Test
    fun `a refusal is addressed back to whoever asked`() {
        val data = query("youtube.com", sourcePort = 51234)
        val parsed = Dns.parseIPv4Udp(data, data.size)!!
        val reply = Dns.refusal(parsed)

        val back = Dns.parseIPv4Udp(reply, reply.size)!!
        assertEquals(51234, back.destinationPort)
        assertEquals(53, back.sourcePort)
        assertEquals("10.111.222.2", back.sourceIp.joinToString(".") { (it.toInt() and 0xFF).toString() })
        assertEquals("10.111.222.1", back.destinationIp.joinToString(".") { (it.toInt() and 0xFF).toString() })
    }

    @Test
    fun `a refusal says no such name, and keeps the id`() {
        val data = query("youtube.com")
        val parsed = Dns.parseIPv4Udp(data, data.size)!!
        val reply = Dns.refusal(parsed)
        val dns = Dns.parseIPv4Udp(reply, reply.size)!!.payload

        // Same id, or the resolver's answer is ignored as unsolicited.
        assertEquals(0x12, dns[0].toInt() and 0xFF)
        assertEquals(0x34, dns[1].toInt() and 0xFF)

        assertTrue("should be a response", (dns[2].toInt() and 0x80) != 0)
        assertEquals("NXDOMAIN", 3, dns[3].toInt() and 0x0F)
        assertEquals("no answers", 0, ((dns[6].toInt() shl 8) or dns[7].toInt()))
    }

    @Test
    fun `the header checksum is what a router would compute`() {
        val data = query("youtube.com")
        val parsed = Dns.parseIPv4Udp(data, data.size)!!
        val reply = Dns.refusal(parsed)

        // Summing a correct header, checksum included, gives all ones.
        var sum = 0
        var i = 0
        while (i < 20) {
            sum += ((reply[i].toInt() and 0xFF) shl 8) or (reply[i + 1].toInt() and 0xFF)
            i += 2
        }
        while (sum shr 16 != 0) sum = (sum and 0xFFFF) + (sum shr 16)
        assertEquals(0xFFFF, sum)
    }
}
