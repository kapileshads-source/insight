using System.Drawing;
using System.Drawing.Drawing2D;
using Microsoft.Win32;

namespace Insight;

/// <summary>
/// The whole interface: an icon in the notification area.
///
/// Deliberately small, for the same reason the extension's popup is. The
/// website owns sessions, Focus Mode, the blocklist and every setting worth
/// having, and duplicating any of it here would create a second place to be
/// wrong. This answers two questions — am I connected, and am I recording
/// right now — and offers the two actions that can only happen on this
/// machine: pair, and stop.
/// </summary>
internal sealed class TrayApp : IDisposable
{
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string RunValue = "Insight";

    private readonly Config _config;
    private readonly Tracker _tracker;
    private readonly NotifyIcon _icon;
    private readonly Icon _recordingIcon;
    private readonly Icon _idleIcon;

    private BlockedWindow? _blockedWindow;
    private PairWindow? _pairWindow;

    internal TrayApp()
    {
        _config = Config.Load();
        _tracker = new Tracker(_config);

        _recordingIcon = BuildIcon(Theme.Good);
        _idleIcon = BuildIcon(Theme.TextFaint);

        _icon = new NotifyIcon
        {
            Icon = _idleIcon,
            Visible = true,
            Text = "Insight",
        };
        _icon.DoubleClick += (_, _) => OpenInsight();
        _icon.ContextMenuStrip = new ContextMenuStrip();
        _icon.ContextMenuStrip.Opening += (_, _) => BuildMenu();

        _tracker.Changed += Refresh;
        _tracker.BlockRequested += ShowBlocked;

        Application.ApplicationExit += (_, _) => _tracker.FlushBeforeExit();

        Refresh();
        _tracker.Start();

        // A student who just installed this has nothing paired and no reason
        // to know the icon is even there.
        if (!_config.Paired) ShowPairWindow();
    }

    // --- icon ---------------------------------------------------------------

    /// <summary>
    /// The tray icon, drawn rather than shipped.
    ///
    /// It has to say one thing at a glance — recording or not — which is the
    /// same job the popup's dot does. Drawing it means the state is the icon
    /// rather than a badge on top of one, and means there is no .ico file to
    /// keep in step with the site's colours.
    /// </summary>
    private static Icon BuildIcon(Color dot)
    {
        using var bitmap = new Bitmap(32, 32);
        using (var g = Graphics.FromImage(bitmap))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            using var ring = new Pen(Theme.TextMuted, 2.5f);
            g.DrawEllipse(ring, 3, 3, 25, 25);

            using var fill = new SolidBrush(dot);
            g.FillEllipse(fill, 10, 10, 12, 12);
        }

        IntPtr handle = bitmap.GetHicon();
        try
        {
            // Cloned because the icon must outlive the handle, which is
            // destroyed below rather than leaked for the life of the process.
            using var temporary = Icon.FromHandle(handle);
            return (Icon)temporary.Clone();
        }
        finally
        {
            Native.DestroyIcon(handle);
        }
    }

    // --- state --------------------------------------------------------------

    private void Refresh()
    {
        SessionState? session = _tracker.Session;
        bool recording = session is not null;

        _icon.Icon = recording ? _recordingIcon : _idleIcon;
        _icon.Text = Truncate("Insight — " + StatusLine());
    }

    private string StatusLine()
    {
        if (!_config.Paired) return "not paired yet";
        if (_tracker.LastError is not null) return _tracker.LastError;

        SessionState? session = _tracker.Session;
        if (session is null) return "not studying";

        return session.FocusMode ? "studying, Focus Mode on" : "studying";
    }

    private string DetailLine()
    {
        if (!_config.Paired) return "Pair this device to start.";

        SessionState? session = _tracker.Session;
        if (session is null) return "Start a session on Insight and this turns on.";

        int minutes = Math.Max(0, (int)(DateTimeOffset.UtcNow - session.StartedAt).TotalMinutes);
        return $"Started {minutes} minute{(minutes == 1 ? "" : "s")} ago.";
    }

    /// The tooltip is truncated by Windows at 63 characters, and a message cut
    /// off mid-word reads as a broken app rather than a long sentence.
    private static string Truncate(string value) =>
        value.Length <= 63 ? value : value[..60] + "…";

    // --- menu ---------------------------------------------------------------

    private void BuildMenu()
    {
        ContextMenuStrip menu = _icon.ContextMenuStrip!;
        menu.Items.Clear();

        var status = new ToolStripMenuItem(StatusLine()) { Enabled = false };
        var detail = new ToolStripMenuItem(DetailLine()) { Enabled = false };
        menu.Items.Add(status);
        menu.Items.Add(detail);
        menu.Items.Add(new ToolStripSeparator());

        if (_config.Paired)
        {
            var check = new ToolStripMenuItem("Check now", null, (_, _) => _tracker.PollNow());
            menu.Items.Add(check);

            var unpair = new ToolStripMenuItem("Unpair this device", null, (_, _) => Unpair());
            menu.Items.Add(unpair);
        }
        else
        {
            menu.Items.Add(new ToolStripMenuItem(
                "Pair this device…", null, (_, _) => ShowPairWindow()));
        }

        menu.Items.Add(new ToolStripMenuItem("Open Insight", null, (_, _) => OpenInsight()));

        var startup = new ToolStripMenuItem("Start with Windows", null, (_, _) => ToggleStartup())
        {
            Checked = StartsWithWindows(),
            CheckOnClick = false,
        };
        menu.Items.Add(startup);

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Quit", null, (_, _) => Quit()));
    }

    private void OpenInsight()
    {
        string url = _config.ApiBase.Length > 0
            ? _config.ApiBase
            : "https://insight-study-sleep.vercel.app";
        Native.OpenUrl(url);
    }

    private void Unpair()
    {
        DialogResult answer = MessageBox.Show(
            "Unpair this computer? Anything counted and not yet sent is discarded, "
            + "and nothing is recorded here until you pair it again.",
            "Insight",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);

        if (answer != DialogResult.Yes) return;

        _tracker.Unpair();
        Refresh();
    }

    private void ShowPairWindow()
    {
        if (_pairWindow is { IsDisposed: false })
        {
            _pairWindow.Activate();
            return;
        }

        _pairWindow = new PairWindow(_config, _tracker);
        _pairWindow.FormClosed += (_, _) => { _pairWindow = null; Refresh(); };
        _pairWindow.Show();
        _pairWindow.Activate();
    }

    private void ShowBlocked(string app)
    {
        if (_blockedWindow is { IsDisposed: false })
        {
            _blockedWindow.Close();
        }

        _blockedWindow = new BlockedWindow(app, _tracker);
        _blockedWindow.FormClosed += (_, _) => _blockedWindow = null;
        _blockedWindow.Show();
        _blockedWindow.Activate();
    }

    // --- start with Windows -------------------------------------------------

    /// <summary>
    /// A per-user Run entry, off by default and toggled only from this menu.
    ///
    /// It is worth having: an app that only counts while a session is running
    /// is useless if it isn't running itself, and a student who forgets to
    /// launch it gets a silent gap that reads as focused time.
    /// </summary>
    private static bool StartsWithWindows()
    {
        try
        {
            using RegistryKey? key = Registry.CurrentUser.OpenSubKey(RunKey);
            return key?.GetValue(RunValue) is not null;
        }
        catch
        {
            return false;
        }
    }

    private void ToggleStartup()
    {
        try
        {
            using RegistryKey key = Registry.CurrentUser.CreateSubKey(RunKey);
            if (StartsWithWindows())
            {
                key.DeleteValue(RunValue, throwOnMissingValue: false);
                return;
            }

            string? path = Environment.ProcessPath;
            if (path is null) return;
            key.SetValue(RunValue, "\"" + path + "\"");
        }
        catch (Exception e)
        {
            MessageBox.Show(
                "Couldn't change that — " + e.Message,
                "Insight",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private void Quit()
    {
        _icon.Visible = false;
        Application.Exit();
    }

    public void Dispose()
    {
        _icon.Visible = false;
        _icon.Dispose();
        _tracker.Dispose();
        _recordingIcon.Dispose();
        _idleIcon.Dispose();
    }
}
