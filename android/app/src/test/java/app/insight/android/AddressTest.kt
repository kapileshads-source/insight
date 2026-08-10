package app.insight.android

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A pairing code sent over plain http to the internet is readable by anyone on
 * the same wifi. Local addresses stay allowed, because that is how this gets
 * developed. Mirrors the Windows and Mac tests exactly.
 */
class AddressTest {

    @Test
    fun `https is fine`() {
        assertNull(Address.problem("https://insight-study-sleep.vercel.app"))
        assertNull(Address.problem("https://example.org:8443"))
    }

    @Test
    fun `http to the internet is refused, and says why`() {
        val problem = Address.problem("http://insight-study-sleep.vercel.app")
        assertNotNull(problem)
        assertTrue(problem!!.contains("https"))
    }

    @Test
    fun `http to a local address is allowed`() {
        assertNull(Address.problem("http://localhost:3000"))
        assertNull(Address.problem("http://127.0.0.1:3000"))
        assertNull(Address.problem("http://192.168.1.138:3000"))
        assertNull(Address.problem("http://10.0.0.4:3000"))
        assertNull(Address.problem("http://kapilesh-mac.local:3000"))
    }

    @Test
    fun `the private range boundary is where it should be`() {
        assertNull(Address.problem("http://172.20.1.1:3000"))
        assertNotNull(Address.problem("http://172.32.1.1:3000"))
    }

    @Test
    fun `anything else is refused`() {
        assertNotNull(Address.problem("ftp://example.org"))
        assertNotNull(Address.problem("not an address"))
        assertNotNull(Address.problem(""))
    }
}
