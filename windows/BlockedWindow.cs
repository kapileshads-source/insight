using System.Drawing;

namespace Insight;

/// <summary>
/// What replaces a blocked app: a small window that says what happened.
///
/// The app has been closed by the time this appears, so "Let me in anyway"
/// starts it again rather than merely restoring a minimised window.
///
/// The override is deliberately available and deliberately slightly slow. The
/// plan calls for a soft commitment rather than a hard lock, because a hard
/// lock gets the app uninstalled, and an uninstalled app records nothing at
/// all. Three seconds interrupts the reflex without becoming a punishment.
///
/// Laid out in panels rather than at pixel coordinates, for the reason given
/// in <see cref="PairWindow"/>: on a display-scaled laptop, fixed coordinates
/// put the text on top of the buttons.
/// </summary>
internal sealed class BlockedWindow : Form
{
    private const int ContentWidth = 400;

    private readonly string _app;
    private readonly Tracker _tracker;
    private readonly Button _override;
    private readonly System.Windows.Forms.Timer _countdown;
    private int _remaining = 3;

    internal BlockedWindow(string app, Tracker tracker)
    {
        _app = app;
        _tracker = tracker;

        Text = "Insight";
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Font = Theme.Body;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Font;

        var layout = new TableLayoutPanel
        {
            ColumnCount = 1,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Fill,
            Padding = new Padding(24, 22, 24, 22),
            BackColor = Theme.Background,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        var heading = new Label
        {
            Text = "Focus Mode is on",
            Font = Theme.Heading,
            ForeColor = Theme.Text,
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 8),
        };

        var body = new Label
        {
            Text = $"{app} is on your blocklist, so it's been closed. If it had "
                 + "unsaved work it will have asked you first.",
            ForeColor = Theme.TextMuted,
            AutoSize = true,
            MaximumSize = new Size(ContentWidth, 0),
            Margin = new Padding(0, 0, 0, 20),
        };

        var back = new Button
        {
            Text = "Back to work",
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(18, 8, 18, 8),
            BackColor = Theme.Accent,
            ForeColor = Color.Black,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 0, 12, 0),
        };
        back.FlatAppearance.BorderSize = 0;
        back.Click += (_, _) => Close();

        _override = new Button
        {
            Text = "Let me in anyway",
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(18, 8, 18, 8),
            BackColor = Theme.Surface,
            ForeColor = Theme.TextMuted,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0),
        };
        _override.FlatAppearance.BorderColor = Theme.Line;
        _override.Click += StartOverride;

        var buttons = new FlowLayoutPanel
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = false,
            Margin = new Padding(0, 0, 0, 16),
            Padding = new Padding(0),
        };
        buttons.Controls.Add(back);
        buttons.Controls.Add(_override);

        var footnote = new Label
        {
            Text = "Overrides are recorded, so your figures reflect what actually happened.",
            ForeColor = Theme.TextFaint,
            Font = Theme.Small,
            AutoSize = true,
            MaximumSize = new Size(ContentWidth, 0),
            Margin = new Padding(0),
        };

        layout.Controls.Add(heading);
        layout.Controls.Add(body);
        layout.Controls.Add(buttons);
        layout.Controls.Add(footnote);

        Controls.Add(layout);
        ClientSize = layout.PreferredSize;

        AcceptButton = back;

        _countdown = new System.Windows.Forms.Timer { Interval = 1000 };
        _countdown.Tick += OnCountdownTick;
    }

    private void StartOverride(object? sender, EventArgs e)
    {
        if (_countdown.Enabled) return;

        _override.Text = $"Opening in {_remaining}…";
        _countdown.Start();
    }

    private void OnCountdownTick(object? sender, EventArgs e)
    {
        _remaining--;
        if (_remaining > 0)
        {
            _override.Text = $"Opening in {_remaining}…";
            return;
        }

        _countdown.Stop();

        // Recorded before it takes effect, so a session that ends mid-override
        // still shows the override.
        _tracker.RecordOverride(_app);
        Close();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _countdown.Dispose();
        base.OnFormClosed(e);
    }
}
