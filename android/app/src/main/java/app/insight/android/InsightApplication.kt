package app.insight.android

import android.app.Application
import android.content.Context
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Keeps the last crash where a person can read it.
 *
 * "Insight keeps stopping" is all Android tells a student, and all they can
 * tell us. A stack trace lives in logcat, which needs a cable and a laptop,
 * so the app writes its own down and the status screen shows it.
 *
 * This is the same principle as everything else here: when something is
 * broken, say what. The difference is that this one is aimed at whoever is
 * fixing it rather than at the student.
 */
class InsightApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        val existing = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                val writer = StringWriter()
                error.printStackTrace(PrintWriter(writer))

                // Trimmed to the part that identifies it. A full trace is
                // unreadable on a phone and unscreenshotable.
                val trace = writer.toString()
                    .lineSequence()
                    .take(12)
                    .joinToString("\n")

                getSharedPreferences("insight", Context.MODE_PRIVATE)
                    .edit()
                    .putString("lastCrash", "on ${thread.name}:\n$trace")
                    .putLong("lastCrashAt", System.currentTimeMillis())
                    .commit()  // not apply: the process is about to die
            } catch (_: Throwable) {
                // Nothing useful to do if even recording the crash crashes.
            }

            existing?.uncaughtException(thread, error)
        }
    }
}
