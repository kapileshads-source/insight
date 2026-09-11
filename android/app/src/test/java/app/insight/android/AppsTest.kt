package app.insight.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The decisions that must not be wrong, tested the way the other four clients
 * test them, deliberately case for case, so that where the apps are supposed
 * to agree, the tests visibly agree too.
 */
class AppsTest {

    @Test
    fun `browsers are counted here, unlike on the desktops`() {
        // The desktop apps skip browsers because the extension counts them.
        // Chrome for Android can't run extensions, so skipping them made phone
        // browsing invisible and unblockable, an inherited rule rather than a
        // decision.
        assertEquals("Chrome", Apps.report("com.android.chrome", "Chrome"))
        assertEquals("Firefox", Apps.report("org.mozilla.firefox", "Firefox"))
    }

    @Test
    fun `a browser is blocked only when the student names it`() {
        // Whole or not at all: reading a URL out of another app needs an
        // accessibility service, which reads the screen, the one thing every
        // client here has promised never to do.
        assertTrue(Apps.isBlocked("Chrome", listOf("chrome")))
        assertFalse(Apps.isBlocked("Chrome", listOf("youtube.com", "instagram.com")))
    }

    @Test
    fun `our own app is not counted`() {
        assertNull(Apps.report("app.insight.android", "Insight"))
    }

    @Test
    fun `aliased apps report the site, so the blocklist can reach them`() {
        assertEquals("spotify.com", Apps.report("com.spotify.music", "Spotify"))
        assertEquals("instagram.com", Apps.report("com.instagram.android", "Instagram"))
        assertEquals("tiktok.com", Apps.report("com.zhiliaoapp.musically", "TikTok"))
        assertEquals("web.whatsapp.com", Apps.report("com.whatsapp", "WhatsApp"))
    }

    @Test
    fun `anything else reports its own label`() {
        assertEquals("Notion", Apps.report("so.notion.app", "Notion"))
        assertEquals("Google Docs", Apps.report("com.google.android.apps.docs", "Google Docs"))
    }

    @Test
    fun `a missing label falls back to the package`() {
        assertEquals("somegame", Apps.report("com.studio.somegame", null))
    }

    @Test
    fun `nothing at all reports nothing`() {
        assertNull(Apps.report(null, "Whatever"))
        assertNull(Apps.report("", "Whatever"))
    }

    @Test
    fun `labels are cleaned rather than trusted`() {
        // A tab is a control character too. Dropping it outright welds two
        // words together, which the Windows app shipped for an hour.
        assertEquals("Acme Viewer", Apps.report("com.x.y", "Acme\tViewer"))
        assertEquals("Acme Reader", Apps.report("com.x.y", "  Acme    Reader  "))
        assertEquals("etcpasswd", Apps.report("com.x.y", "/etc/passwd"))
    }

    @Test
    fun `an absurd label is truncated to the field's limit`() {
        assertEquals(253, Apps.report("com.x.y", "a".repeat(400))?.length)
    }

    @Test
    fun `the blocklist matches hostnames and their subdomains`() {
        val list = listOf("youtube.com", "spotify.com", "roblox.com")

        assertTrue(Apps.isBlocked("youtube.com", list))
        assertTrue(Apps.isBlocked("music.youtube.com", list))
        assertTrue(Apps.isBlocked("www.spotify.com", list))
        assertTrue(Apps.isBlocked("Roblox.com", list))
    }

    @Test
    fun `the blocklist does not over-reach`() {
        val list = listOf("youtube.com", "spotify.com")

        assertFalse(Apps.isBlocked("khanacademy.org", list))
        assertFalse(Apps.isBlocked("notyoutube.com", list))
        assertFalse(Apps.isBlocked("Google Docs", list))
        assertFalse(Apps.isBlocked("", list))
        assertFalse(Apps.isBlocked("youtube.com", emptyList()))
    }

    @Test
    fun `app names in the blocklist match apps, and never a hostname`() {
        // The server sends app names in the same flat list as hostnames, which
        // is what finally made a game blockable.
        val list = listOf("valorant", "minecraft", "youtube.com")

        assertTrue(Apps.isBlocked("Valorant", list))
        assertTrue(Apps.isBlocked("Minecraft", list))
        assertFalse(Apps.isBlocked("Google Docs", list))
        assertFalse(Apps.isBlocked("valorant.example.com", list))
    }
}
