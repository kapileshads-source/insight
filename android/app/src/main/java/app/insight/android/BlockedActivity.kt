package app.insight.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay

/**
 * What a blocked app is replaced with.
 *
 * This is the one thing Android does better than iPhone: no entitlement, no
 * approval, no company behind it, a blocked app really is replaced, by this.
 *
 * The override is deliberately available and deliberately slow. The plan calls
 * for a soft commitment rather than a hard lock, because a hard lock gets the
 * app uninstalled and an uninstalled app blocks nothing at all. Three seconds
 * interrupts the reflex without becoming a punishment, and it is the same
 * three seconds the extension and both desktop apps use.
 *
 * Back is disabled. Not to trap anyone, "Back to work" is right there and
 * sends you home, but because a back press would drop you straight into the
 * app that was just blocked, which makes the block look broken rather than
 * merciful.
 */
class BlockedActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val app = intent.getStringExtra(EXTRA_APP) ?: "That app"
        val packageName = intent.getStringExtra(EXTRA_PACKAGE)

        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = goHome()
        })

        setContent {
            var remaining by remember { mutableIntStateOf(0) }
            var counting by remember { mutableStateOf(false) }

            if (counting) {
                androidx.compose.runtime.LaunchedEffect(Unit) {
                    remaining = 3
                    while (remaining > 0) {
                        delay(1_000)
                        remaining -= 1
                    }
                    // Recorded before it takes effect, so a session that ends
                    // mid-override still shows the override.
                    startService(
                        Intent(this@BlockedActivity, TrackerService::class.java)
                            .setAction(TrackerService.ACTION_OVERRIDE)
                            .putExtra(EXTRA_APP, app)
                            .putExtra(EXTRA_PACKAGE, packageName)
                    )
                    finish()
                }
            }

            Surface(color = Insight.background, modifier = Modifier.fillMaxSize()) {
                Column(
                    Modifier.fillMaxSize().padding(28.dp),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        "Focus Mode is on",
                        color = Insight.text,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.SemiBold,
                    )

                    Spacer(Modifier.height(14.dp))

                    Text(
                        "$app is on your blocklist, and a study session is running, " +
                            "so it's been closed. It'll be there when you finish.",
                        color = Insight.textMuted,
                        fontSize = 17.sp,
                    )

                    Spacer(Modifier.height(36.dp))

                    Button(
                        onClick = { goHome() },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Insight.accent,
                            contentColor = Color.Black,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                    ) {
                        Text("Back to work", fontSize = 17.sp)
                    }

                    TextButton(
                        onClick = { counting = true },
                        enabled = !counting,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            if (counting) "Opening in $remaining…" else "Let me in anyway",
                            color = Insight.textMuted,
                            fontSize = 16.sp,
                        )
                    }

                    Spacer(Modifier.height(24.dp))

                    Text(
                        "Overrides are recorded, so your figures reflect what actually " +
                            "happened rather than what you meant to do.",
                        color = Insight.textFaint,
                        fontSize = 13.sp,
                    )
                }
            }
        }
    }

    /// Home rather than back, which would land in the blocked app again.
    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    companion object {
        const val EXTRA_APP = "app"
        const val EXTRA_PACKAGE = "package"
    }
}
