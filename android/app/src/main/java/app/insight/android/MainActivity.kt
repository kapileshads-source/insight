package app.insight.android

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The whole interface: pair, and see whether it's recording.
 *
 * Deliberately small, like the extension popup and both tray apps. The website
 * owns sessions, Focus Mode, the blocklist and every setting worth having, and
 * a second place to change something is a second place to be wrong.
 *
 * The one thing this screen must do well is the permission. Usage access is
 * granted in Settings rather than by a dialog, so a student who doesn't
 * understand why gets an app that silently records nothing.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val config = Config(this)

        setContent {
            var paired by remember { mutableStateOf(config.paired) }
            var hasUsageAccess by remember { mutableStateOf(usageAccessGranted()) }

            // Re-checked on every resume, because the student grants it in
            // Settings and comes back — there is no callback for it.
            LifecycleResumeEffect(Unit) {
                hasUsageAccess = usageAccessGranted()
                onPauseOrDispose {}
            }

            Surface(color = Insight.background, modifier = Modifier.fillMaxSize()) {
                if (paired) {
                    StatusScreen(
                        config = config,
                        hasUsageAccess = hasUsageAccess,
                        onGrant = { openUsageSettings() },
                        onUnpair = {
                            TrackerService.stop(this@MainActivity)
                            config.clear()
                            paired = false
                        },
                    )
                } else {
                    PairScreen(config = config, onPaired = {
                        paired = true
                        TrackerService.start(this@MainActivity)
                    })
                }
            }
        }
    }

    private fun usageAccessGranted(): Boolean {
        val ops = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun openUsageSettings() {
        startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }
}

/** The website's palette, so the phone doesn't feel like a different product. */
object Insight {
    val background = Color(0xFF0E0F11)
    val surface = Color(0xFF16181B)
    val text = Color(0xFFECEDEE)
    val textMuted = Color(0xFF9BA1A6)
    val textFaint = Color(0xFF6E747A)
    val accent = Color(0xFF5BA8F5)
    val good = Color(0xFF4AC38A)
    val bad = Color(0xFFE57A7A)
}

@Composable
private fun PairScreen(config: Config, onPaired: () -> Unit) {
    val scope = rememberCoroutineScope()
    var apiBase by remember { mutableStateOf("https://insight-study-sleep.vercel.app") }
    var code by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf<String?>(null) }
    var working by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Spacer(Modifier.height(24.dp))
        Text("Pair this phone", color = Insight.text, fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        Text(
            "On Insight, open Devices, generate a pairing code, and paste it below. It is shown once.",
            color = Insight.textMuted, fontSize = 16.sp,
        )

        Field("Insight address", apiBase, { apiBase = it })
        Field("Pairing code", code, { code = it })

        Button(
            onClick = {
                working = true
                problem = null
                scope.launch {
                    val base = apiBase.trim().trimEnd('/')
                    val token = code.trim()

                    val addressProblem = Address.problem(base)
                    if (addressProblem != null) {
                        problem = addressProblem
                        working = false
                        return@launch
                    }

                    // Checked before it's saved, so a mistyped code fails here
                    // rather than looking connected and recording nothing.
                    val result = withContext(Dispatchers.IO) {
                        ApiClient().poll(base, token)
                    }
                    working = false

                    when (result.status) {
                        PollStatus.UNAUTHORISED ->
                            problem = "That code wasn't accepted. Generate a new one on the website."
                        PollStatus.UNREACHABLE ->
                            problem = "Couldn't reach $base. Check the address and your connection."
                        PollStatus.OK -> {
                            config.apiBase = base
                            config.token = token
                            onPaired()
                        }
                    }
                }
            },
            enabled = !working && apiBase.isNotBlank() && code.isNotBlank(),
            colors = ButtonDefaults.buttonColors(containerColor = Insight.accent, contentColor = Color.Black),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth().height(52.dp),
        ) {
            Text(if (working) "Checking…" else "Pair", fontSize = 17.sp)
        }

        problem?.let { Text(it, color = Insight.bad, fontSize = 15.sp) }

        Text(
            "This phone never receives your encryption password, and can't read anything you've " +
                "already logged. Pairing grants the ability to add, never to read.",
            color = Insight.textFaint, fontSize = 13.sp,
        )
    }
}

@Composable
private fun StatusScreen(
    config: Config,
    hasUsageAccess: Boolean,
    onGrant: () -> Unit,
    onUnpair: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        Spacer(Modifier.height(40.dp))
        Text(
            if (hasUsageAccess) "Recording when you study" else "One permission left",
            color = Insight.text, fontSize = 26.sp, fontWeight = FontWeight.SemiBold,
        )

        if (!hasUsageAccess) {
            // The honest version of a permission screen: what it is, why it's
            // needed, and what it doesn't grant. A student who taps through
            // without reading is exactly the student this app is for.
            Column(
                Modifier.fillMaxWidth().background(Insight.surface, RoundedCornerShape(12.dp)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "Android needs you to turn on usage access for Insight, in Settings. " +
                        "It's the permission that lets an app see which app is in front.",
                    color = Insight.textMuted, fontSize = 15.sp,
                )
                Text(
                    "It gives us app names and nothing else — never what's on screen, never " +
                        "what you typed. And nothing at all is recorded unless a study session " +
                        "is running. You can take it back in the same place.",
                    color = Insight.textFaint, fontSize = 13.sp,
                )
                Button(
                    onClick = onGrant,
                    colors = ButtonDefaults.buttonColors(containerColor = Insight.accent, contentColor = Color.Black),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Open Settings", fontSize = 16.sp) }
            }
        } else {
            Text(
                "Start a session on Insight and this counts which apps you use, until you stop it. " +
                    "Nothing is recorded at any other time.",
                color = Insight.textMuted, fontSize = 16.sp,
            )
        }

        Text(
            "Paired to ${config.apiBase.removePrefix("https://")}",
            color = Insight.textFaint, fontSize = 13.sp,
        )

        TextButton(onClick = onUnpair) {
            Text("Unpair this phone", color = Insight.textMuted, fontSize = 16.sp)
        }
    }
}

@Composable
private fun Field(label: String, value: String, onChange: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, color = Insight.textMuted, fontSize = 13.sp)
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            singleLine = false,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Insight.text,
                unfocusedTextColor = Insight.text,
                focusedContainerColor = Insight.surface,
                unfocusedContainerColor = Insight.surface,
                focusedBorderColor = Insight.accent,
                unfocusedBorderColor = Insight.surface,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
