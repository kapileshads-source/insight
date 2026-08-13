using System.Diagnostics;
using Microsoft.Win32;

namespace Insight;

/// <summary>
/// Counts seconds per app while a session is running, and asks the UI to get
/// in the way when Focus Mode says so.
///
/// The extension's background worker is the reference implementation and this
/// keeps to its rules:
///
///   - Nothing is recorded when no session is running. Not recorded and then
///     discarded — the timer simply does not accumulate.
///   - App names only, never window titles. See <see cref="Native"/>.
///   - No encryption key here, ever. What this posts lands in a staging table
///     the server can read, and the student's browser encrypts and deletes it
///     on next load.
///   - Elapsed time is measured against a stored timestamp rather than counted
///     by a ticker, so a laptop that sleeps neither invents nor loses minutes.
///
/// The one rule this adds is idleness: a desktop has no equivalent of a
/// browser losing focus, so a machine left alone with a game on top would bill
/// hours nobody was present for.
/// </summary>
internal sealed class Tracker : IDisposable
{
    /// How long without keyboard or mouse before we assume they walked away.
    /// Long enough to read a page of a PDF without being marked absent; short
    /// enough that lunch doesn't count as revision.
    private static readonly TimeSpan IdleThreshold = TimeSpan.FromMinutes(10);

    /// Same clamp the extension uses. A slice longer than this is a bug or a
    /// suspended machine, and either way it is not study time.
    private static readonly TimeSpan MaxSlice = TimeSpan.FromHours(6);

    /// Re-focusing a blocked app shouldn't file a fresh block event every
    /// second — that would fill the batch with 200 identical rows and push out
    /// the real ones.
    private static readonly TimeSpan BlockCooldown = TimeSpan.FromSeconds(30);

    /// Activity is batched every minute, but session state is asked for four
    /// times as often. Focus Mode is switched on at the website, and a student
    /// who flips it and then watches nothing happen for a minute concludes the
    /// app is broken — which, from where they're standing, it is.
    private const int FlushEverySeconds = 60;
    private const int PollEverySeconds = 15;

    /// The endpoint accepts 200 entries. Sending more loses the whole batch.
    private const int MaxDomainsPerFlush = 200;

    private readonly Config _config;
    private readonly ApiClient _api;
    private readonly System.Windows.Forms.Timer _timer;
    private readonly SynchronizationContext _sync;
    private readonly uint _ownProcessId;

    private Dictionary<string, int> _tally = new(StringComparer.Ordinal);
    private List<BlockEvent> _blocked = new();
    private readonly Dictionary<string, DateTime> _lastBlockAt = new(StringComparer.Ordinal);

    /// Apps the student overrode. Cleared when the session ends, because an
    /// override is a decision about this study session and not a permanent
    /// hole in their blocklist.
    private readonly HashSet<string> _allowed = new(StringComparer.Ordinal);

    private string? _currentApp;
    private DateTime _currentSince;
    private int _secondsSinceFlush;
    private int _secondsSincePoll;
    private bool _flushInFlight;

    /// Where a blocked app lives, so an override can start it again. Closing
    /// something and then leaving the student to go and find it themselves
    /// would be a worse experience than the block.
    private readonly Dictionary<string, string> _blockedAppPaths = new(StringComparer.Ordinal);

    internal SessionState? Session { get; private set; }
    internal IReadOnlyList<string> Blocklist { get; private set; } = new List<string>();
    internal string? LastError { get; private set; }
    internal bool Paired => _config.Paired;

    /// Raised whenever the tray's answer to "am I connected, am I recording"
    /// might have changed.
    internal event Action? Changed;

    /// Raised when a blocked app was pushed out of the way and the student
    /// should be told why.
    internal event Action<string>? BlockRequested;

    internal Tracker(Config config)
    {
        _config = config;
        _api = new ApiClient(config);
        _sync = SynchronizationContext.Current ?? new SynchronizationContext();
        _ownProcessId = (uint)Environment.ProcessId;

        _timer = new System.Windows.Forms.Timer { Interval = 1000 };
        _timer.Tick += (_, _) => Tick();

        SystemEvents.SessionSwitch += OnSessionSwitch;
        SystemEvents.PowerModeChanged += OnPowerModeChanged;
    }

    internal void Start()
    {
        _timer.Start();
        PollNow();
    }

    // --- pairing ------------------------------------------------------------

    /// Try a code before it is saved, so a mistyped one fails on the pairing
    /// screen rather than looking connected and silently never recording.
    internal Task<PollResult> VerifyAsync(string apiBase, string token) =>
        _api.PollAsync(apiBase, token);

    internal void ApplyPairing(string apiBase, string token, PollResult result)
    {
        _config.ApiBase = apiBase;
        _config.Token = token;
        _config.Save();

        Session = result.Session;
        Blocklist = result.Blocklist;
        LastError = null;
        Changed?.Invoke();
    }

    /// Unpairing leaves nothing behind — including whatever was counted and
    /// not yet sent.
    internal void Unpair()
    {
        _config.Clear();
        Session = null;
        Blocklist = new List<string>();
        _tally = new Dictionary<string, int>(StringComparer.Ordinal);
        _blocked = new List<BlockEvent>();
        _allowed.Clear();
        _currentApp = null;
        LastError = null;
        Changed?.Invoke();
    }

    // --- time accounting ----------------------------------------------------

    /// <summary>
    /// Close out the app currently in front and add its seconds to the tally.
    /// </summary>
    /// <param name="endAt">
    /// When the slice really ended, which is not always now — time spent idle
    /// ended the slice at the last keypress, not at the moment we noticed.
    /// </param>
    private void CloseSlice(DateTime? endAt = null)
    {
        if (Session is null || _currentApp is null) return;

        DateTime end = endAt ?? DateTime.UtcNow;
        if (end < _currentSince) end = _currentSince;

        var elapsed = end - _currentSince;
        if (elapsed > TimeSpan.Zero && elapsed < MaxSlice)
        {
            int seconds = (int)elapsed.TotalSeconds;
            if (seconds > 0)
            {
                _tally[_currentApp] = _tally.GetValueOrDefault(_currentApp) + seconds;
            }
        }

        _currentApp = null;
    }

    /// What is in front right now, or null if there is nothing worth counting.
    private string? ForegroundApp(out IntPtr window)
    {
        window = Native.GetForegroundWindow();
        if (window == IntPtr.Zero) return null;

        Native.GetWindowThreadProcessId(window, out uint pid);
        if (pid == 0) return null;

        // Our own blocked notice must not be counted as an app the student
        // chose to use.
        if (pid == _ownProcessId) return null;

        string? path = Native.ExecutablePath(pid);
        if (path is null) return null;

        string processName = Path.GetFileNameWithoutExtension(path);
        string? description = null;
        try
        {
            description = FileVersionInfo.GetVersionInfo(path).FileDescription;
        }
        catch
        {
            // No version resource, or unreadable. The process name is a fine
            // answer and is what most of these would report anyway.
        }

        return Apps.Report(processName, description);
    }

    private void Tick()
    {
        // No session, no recording. This is the promise the privacy page makes
        // and the reason this check is the first thing here.
        if (Session is null)
        {
            _currentApp = null;
        }
        else
        {
            var idle = Native.IdleFor();
            // A locked screen is away immediately: unlike keyboard idle, it
            // cannot be produced by a stray touch. See Native.ScreenLocked.
            if (Native.ScreenLocked() || idle >= IdleThreshold)
            {
                CloseSlice(DateTime.UtcNow - idle);
            }
            else
            {
                Observe();
            }
        }

        _secondsSinceFlush++;
        _secondsSincePoll++;

        if (_secondsSinceFlush >= FlushEverySeconds)
        {
            _secondsSinceFlush = 0;
            _secondsSincePoll = 0;
            SyncNow();
        }
        else if (_secondsSincePoll >= PollEverySeconds)
        {
            _secondsSincePoll = 0;
            SyncNow(sending: false);
        }
    }

    private void Observe()
    {
        string? app = ForegroundApp(out IntPtr window);
        if (app is null)
        {
            CloseSlice();
            return;
        }

        if (app == _currentApp) return;

        CloseSlice();

        if (Session is { FocusMode: true } &&
            !_allowed.Contains(app) &&
            Apps.IsBlocked(app, Blocklist))
        {
            Enforce(app, window);
            return;
        }

        _currentApp = app;
        _currentSince = DateTime.UtcNow;
    }

    /// <summary>
    /// Push a blocked app out of the way, and say why.
    ///
    /// Closed, not minimised. Minimising was the first attempt and it is
    /// toothless — one Alt-Tab and you're back where you were, which makes
    /// Focus Mode a suggestion rather than a decision.
    ///
    /// `CloseMainWindow` is the polite close, the same message the X button
    /// sends: an app with unsaved work still puts up its save dialog and still
    /// wins the argument. Nothing is destroyed silently, which is the line
    /// worth holding — the point is to make going back deliberate, not to
    /// punish. Where an app refuses or has no window to close, minimising is
    /// the fallback so something still happens.
    /// </summary>
    private void Enforce(string app, IntPtr window)
    {
        DateTime now = DateTime.UtcNow;
        if (_lastBlockAt.TryGetValue(app, out DateTime last) && now - last < BlockCooldown)
        {
            // Already handled a moment ago. Still don't count the time.
            return;
        }
        _lastBlockAt[app] = now;

        bool closed = false;
        if (window != IntPtr.Zero)
        {
            Native.GetWindowThreadProcessId(window, out uint pid);

            string? path = pid == 0 ? null : Native.ExecutablePath(pid);
            if (path is not null) _blockedAppPaths[app] = path;

            try
            {
                using Process process = Process.GetProcessById((int)pid);
                closed = process.CloseMainWindow();
            }
            catch
            {
                // Gone between the look and the close, or protected. The
                // fallback below still gets it off the screen.
            }

            if (!closed) Native.ShowWindow(window, Native.SW_MINIMIZE);
        }

        _blocked.Add(new BlockEvent(app, false));
        BlockRequested?.Invoke(app);
    }

    /// <summary>
    /// The student decided to go ahead anyway.
    ///
    /// Recorded before it takes effect, so the session's distraction figures
    /// reflect what actually happened, and allowed for the rest of the session
    /// so they aren't fought with every thirty seconds.
    /// </summary>
    internal void RecordOverride(string app)
    {
        _allowed.Add(app);
        _blocked.Add(new BlockEvent(app, true));
        SyncNow();

        // Start it again, since we closed it.
        if (!_blockedAppPaths.TryGetValue(app, out string? path)) return;

        try
        {
            Process.Start(new ProcessStartInfo { FileName = path, UseShellExecute = true });
        }
        catch
        {
            // Moved or uninstalled since. The student can open it themselves;
            // failing here shouldn't take the override with it.
        }
    }

    // --- sync ---------------------------------------------------------------

    internal void PollNow() => SyncNow();

    private void SyncNow(bool sending = true)
    {
        if (_flushInFlight) return;
        _flushInFlight = true;
        _ = RunSyncAsync(sending);
    }

    private async Task RunSyncAsync(bool sending)
    {
        try
        {
            await SyncAsync(sending).ConfigureAwait(true);
        }
        finally
        {
            _flushInFlight = false;
        }
    }

    private async Task SyncAsync(bool sending)
    {
        if (!_config.Paired) return;

        if (sending)
        {
            // Roll the open slice into the tally first, so an app left in
            // front for an hour reports steadily rather than all at once when
            // they finally switch away.
            string? open = _currentApp;
            CloseSlice();

            await FlushAsync().ConfigureAwait(true);

            if (open is not null && Session is not null)
            {
                _currentApp = open;
                _currentSince = DateTime.UtcNow;
            }
        }

        await PollAsync().ConfigureAwait(true);
    }

    private async Task PollAsync()
    {
        PollResult result = await _api.PollAsync().ConfigureAwait(true);

        if (result.Status == PollStatus.Unauthorised)
        {
            // Revoked, or the wrong code. Say so plainly rather than failing
            // silently and looking like the app simply stopped.
            Session = null;
            _currentApp = null;
            LastError = "This device was unpaired. Pair it again from Insight.";
            Changed?.Invoke();
            return;
        }

        if (result.Status == PollStatus.Unreachable)
        {
            LastError = "Can't reach Insight. Retrying.";
            Changed?.Invoke();
            return;
        }

        SessionState? previous = Session;
        bool changed = previous is not null && previous.Id != result.Session?.Id;

        // Close the open slice *before* Session is reassigned. CloseSlice
        // returns early when Session is null, so doing this afterwards threw
        // away everything counted since the last flush every time a session
        // ended — which is every session. The comment below has always
        // described the intent; the ordering defeated it.
        if (changed) CloseSlice();

        Session = result.Session;
        Blocklist = result.Blocklist;
        LastError = null;

        // The session ended, or a different one started. Either way the tally
        // belongs to the old id, and posting it after that id stops being
        // current loses the last minute of every session.
        if (previous is not null && changed)
        {
            await FlushAsync(previous.Id).ConfigureAwait(true);
            _allowed.Clear();
            _lastBlockAt.Clear();
        }

        Changed?.Invoke();
    }

    /// <summary>
    /// Send the tally and clear it.
    ///
    /// The tally is taken out of the field before the request and put back on
    /// failure, so a dropped connection delays the data rather than destroying
    /// it, and seconds counted while the request was in flight aren't lost to
    /// a blind clear.
    /// </summary>
    private async Task FlushAsync(string? sessionIdOverride = null)
    {
        string? sessionId = sessionIdOverride ?? Session?.Id;
        if (!_config.Paired || sessionId is null) return;
        if (_tally.Count == 0 && _blocked.Count == 0) return;

        Dictionary<string, int> tally = _tally;
        List<BlockEvent> blocked = _blocked;
        _tally = new Dictionary<string, int>(StringComparer.Ordinal);
        _blocked = new List<BlockEvent>();

        List<DomainTime> domains = tally
            .Where(e => e.Value > 0)
            .OrderByDescending(e => e.Value)
            .Take(MaxDomainsPerFlush)
            .Select(e => new DomainTime(e.Key, Math.Min(e.Value, 86_400)))
            .ToList();

        List<BlockEvent> events = blocked.Take(MaxDomainsPerFlush).ToList();

        if (domains.Count == 0 && events.Count == 0) return;

        bool ok = await _api.PostActivityAsync(sessionId, domains, events).ConfigureAwait(true);
        if (ok) return;

        // Put it back, merging with anything counted meanwhile.
        foreach (var entry in tally)
        {
            _tally[entry.Key] = _tally.GetValueOrDefault(entry.Key) + entry.Value;
        }
        _blocked.InsertRange(0, blocked);
    }

    // --- machine state ------------------------------------------------------

    private void OnSessionSwitch(object sender, SessionSwitchEventArgs e)
    {
        // Locking the screen is leaving the desk. These arrive on a system
        // thread, so hand them to the UI thread that owns the tally.
        if (e.Reason is SessionSwitchReason.SessionLock or SessionSwitchReason.SessionLogoff)
        {
            _sync.Post(_ => CloseSlice(), null);
        }
    }

    private void OnPowerModeChanged(object sender, PowerModeChangedEventArgs e)
    {
        if (e.Mode == PowerModes.Suspend)
        {
            _sync.Post(_ => CloseSlice(), null);
        }
        else if (e.Mode == PowerModes.Resume)
        {
            // The lid was shut for an unknown length of time; whatever the
            // clock says about the app still in front, it wasn't being used.
            _sync.Post(_ => { _currentApp = null; SyncNow(); }, null);
        }
    }

    /// <summary>
    /// Last chance to send what's counted, on quit or log-off.
    ///
    /// Blocking briefly here is worth the last minute of a session. The timer
    /// is stopped first and the request runs on a pool thread with no captured
    /// context, so nothing else touches the tally and nothing deadlocks
    /// against the UI thread this is called from.
    /// </summary>
    internal void FlushBeforeExit()
    {
        _timer.Stop();
        if (!_config.Paired || Session is null) return;

        CloseSlice();
        try
        {
            Task.Run(() => FlushAsync()).Wait(TimeSpan.FromSeconds(5));
        }
        catch
        {
            // Quitting is not the moment to argue about a failed request.
        }
    }

    public void Dispose()
    {
        SystemEvents.SessionSwitch -= OnSessionSwitch;
        SystemEvents.PowerModeChanged -= OnPowerModeChanged;
        _timer.Dispose();
    }
}
