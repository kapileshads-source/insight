package app.insight.android

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.net.Uri
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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

        // Started here, not only when pairing succeeds.
        //
        // That was the bug: the service was launched once, from the pairing
        // callback, so a paired student who reinstalled the app — or simply
        // rebooted — opened it to a status screen saying everything was fine
        // while nothing was running. Silence that looks like health is the
        // worst failure this app can have, because the missing time reads as
        // focused time later.
        if (config.paired) TrackerService.start(this)

        setContent {
            var paired by remember { mutableStateOf(config.paired) }
            var hasUsageAccess by remember { mutableStateOf(usageAccessGranted()) }
            var canDrawOver by remember { mutableStateOf(Settings.canDrawOverlays(this)) }

            // Re-checked on every resume, because both are granted in Settings
            // and the student walks back in — there is no callback for either.
            var trackerQuiet by remember { mutableStateOf(false) }
            var sessionRunning by remember { mutableStateOf(config.sessionRunning) }
            var focusMode by remember { mutableStateOf(config.focusMode) }
            var blocklistSize by remember { mutableIntStateOf(config.blocklistSize) }
            var canBlockSites by remember {
                mutableStateOf(FocusVpnService.consentIntent(this) == null)
            }

            // Android will only hand out the VPN consent dialog to an
            // activity, which is why blocking sites has to be asked for here
            // rather than by the service that needs it.
            val askForVpn = rememberLauncherForActivityResult(
                ActivityResultContracts.StartActivityForResult()
            ) { canBlockSites = FocusVpnService.consentIntent(this) == null }

            LifecycleResumeEffect(Unit) {
                hasUsageAccess = usageAccessGranted()
                canDrawOver = Settings.canDrawOverlays(this@MainActivity)

                // Polls run every fifteen seconds, so two minutes of silence
                // means it isn't running — not that the network is slow.
                val since = System.currentTimeMillis() - config.lastTickAt
                trackerQuiet = config.paired && since > 120_000
                sessionRunning = config.sessionRunning
                focusMode = config.focusMode
                blocklistSize = config.blocklistSize
                canBlockSites = FocusVpnService.consentIntent(this@MainActivity) == null

                onPauseOrDispose {}
            }

            Surface(color = Insight.background, modifier = Modifier.fillMaxSize()) {
                if (paired) {
                    StatusScreen(
                        config = config,
                        hasUsageAccess = hasUsageAccess,
                        canDrawOver = canDrawOver,
                        trackerQuiet = trackerQuiet,
                        canBlockSites = canBlockSites,
                        sessionRunning = sessionRunning,
                        focusMode = focusMode,
                        blocklistSize = blocklistSize,
                        onAllowSiteBlocking = {
                            FocusVpnService.consentIntent(this@MainActivity)
                                ?.let { askForVpn.launch(it) }
                        },
                        onRestart = { TrackerService.start(this@MainActivity) },
                        onGrant = { openUsageSettings() },
                        onGrantOverlay = { openOverlaySettings() },
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

    private fun openOverlaySettings() {
        startActivity(
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName"),
            )
        )
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
    canDrawOver: Boolean,
    trackerQuiet: Boolean,
    canBlockSites: Boolean,
    sessionRunning: Boolean,
    focusMode: Boolean,
    blocklistSize: Int,
    onAllowSiteBlocking: () -> Unit,
    onRestart: () -> Unit,
    onGrant: () -> Unit,
    onGrantOverlay: () -> Unit,
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

        if (trackerQuiet) {
            Column(
                Modifier.fillMaxWidth()
                    .background(Insight.surface, RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("It hasn't checked in for a while", color = Insight.bad, fontSize = 17.sp)
                Text(
                    "The tracker should reach Insight every fifteen seconds. If it " +
                        "has been quiet for minutes, it isn't running — anything you " +
                        "studied meanwhile wasn't counted.",
                    color = Insight.textMuted, fontSize = 15.sp,
                )
                Button(
                    onClick = onRestart,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Insight.surface, contentColor = Insight.accent),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Start it again", fontSize = 16.sp) }
            }
        }

        if (hasUsageAccess && !canDrawOver) {
            // Separate from usage access on purpose. Counting works without
            // this; blocking doesn't. A student who wants the measurement and
            // not the blocking should be able to stop here, and one who wants
            // Focus Mode should be told plainly that it does nothing until
            // this is on.
            Column(
                Modifier.fillMaxWidth()
                    .background(Insight.surface, RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Focus Mode needs one more", color = Insight.text, fontSize = 17.sp)
                Text(
                    "To put a screen in front of a blocked app, Android needs " +
                        "permission to draw over other apps. Without it, sessions are " +
                        "still counted — nothing is blocked.",
                    color = Insight.textMuted, fontSize = 15.sp,
                )
                Text(
                    "It lets us show our own screen over another app, and nothing " +
                        "else. Revocable in the same place.",
                    color = Insight.textFaint, fontSize = 13.sp,
                )
                Button(
                    onClick = onGrantOverlay,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Insight.surface, contentColor = Insight.accent),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Allow blocking", fontSize = 16.sp) }
            }
        }

        if (hasUsageAccess && !canBlockSites) {
            Column(
                Modifier.fillMaxWidth()
                    .background(Insight.surface, RoundedCornerShape(12.dp))
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Block websites too", color = Insight.text, fontSize = 17.sp)
                Text(
                    "Blocking an app is easy; blocking a site inside a browser means " +
                        "refusing to look it up. Android calls that a VPN and will ask " +
                        "you to allow one.",
                    color = Insight.textMuted, fontSize = 15.sp,
                )
                Text(
                    "It carries nothing but those lookups — not your pages, messages " +
                        "or video — and it only runs while a session with Focus Mode is " +
                        "going. Blocked names are recorded; the rest are forwarded to " +
                        "your usual provider and forgotten.",
                    color = Insight.textFaint, fontSize = 13.sp,
                )
                Button(
                    onClick = onAllowSiteBlocking,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Insight.surface, contentColor = Insight.accent),
                    shape = RoundedCornerShape(10.dp),
                ) { Text("Allow website blocking", fontSize = 16.sp) }
            }
        }

        if (canBlockSites) {
            Text(
                "Website blocking is on. If your browser has its own VPN or its own " +
                    "secure DNS — Opera and Chrome both offer one — turn that off, or " +
                    "the lookups never reach us and blocked sites load anyway.",
                color = Insight.textFaint, fontSize = 13.sp,
            )
        }

        // Blocking has five preconditions and four of them are invisible. When
        // any is missing, say which — "it isn't blocking" is otherwise
        // impossible to diagnose without someone else's phone in your hand.
        val blockingReady =
            hasUsageAccess && canDrawOver && sessionRunning && focusMode && blocklistSize > 0

        Column(
            Modifier.fillMaxWidth()
                .background(Insight.surface, RoundedCornerShape(12.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                if (blockingReady) "Blocking is on" else "Why nothing is being blocked",
                color = if (blockingReady) Insight.good else Insight.text,
                fontSize = 17.sp,
            )

            Check("A session is running", sessionRunning, "Start one on Insight")
            Check("Focus Mode is on", focusMode, "Turn it on with the session")
            Check("Your blocklist reached us", blocklistSize > 0, "Nothing to block yet")
            Check("Can see which app is in front", hasUsageAccess, "Usage access, above")
            Check("Can put a screen in front of one", canDrawOver, "Drawing over apps, above")
            Check("Can block websites", canBlockSites, "Optional — needs the VPN")

            if (blocklistSize > 0) {
                Text(
                    "$blocklistSize sites and apps on your list.",
                    color = Insight.textFaint, fontSize = 13.sp,
                )
            }
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
private fun Check(label: String, ok: Boolean, missing: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(if (ok) "✓" else "✗", color = if (ok) Insight.good else Insight.bad, fontSize = 15.sp)
        Column {
            Text(label, color = Insight.textMuted, fontSize = 15.sp)
            if (!ok) Text(missing, color = Insight.textFaint, fontSize = 13.sp)
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
