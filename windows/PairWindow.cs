using System.Drawing;

namespace Insight;

/// <summary>
/// Pair this computer with an Insight account.
///
/// The same two fields as the extension's popup, and the same rule: the code
/// is verified against the server before it is saved. A code that is saved
/// without being checked produces an app that looks connected, records
/// nothing, and gives a student no way to tell — which is worse than a dialog
/// that says no.
///
/// Everything is stacked in a <see cref="TableLayoutPanel"/> rather than
/// placed at pixel coordinates. The first build did the latter and the first
/// laptop it ran on was display-scaled, so WinForms grew the fonts, left the
/// coordinates where they were, and the heading landed on top of the sentence
/// under it. Rows that size themselves can't collide.
/// </summary>
internal sealed class PairWindow : Form
{
    private const string DefaultApiBase = "https://insight-study-sleep.vercel.app";

    /// Wrapping width for the prose, in unscaled pixels. WinForms multiplies
    /// this by the display's scale factor along with everything else.
    private const int ContentWidth = 420;

    private readonly Config _config;
    private readonly Tracker _tracker;

    private readonly TextBox _apiBase;
    private readonly TextBox _token;
    private readonly Button _pair;
    private readonly Label _error;

    internal PairWindow(Config config, Tracker tracker)
    {
        _config = config;
        _tracker = tracker;

        Text = "Pair with Insight";
        BackColor = Theme.Background;
        ForeColor = Theme.Text;
        Font = Theme.Body;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Font;

        var layout = new TableLayoutPanel
        {
            ColumnCount = 1,
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Dock = DockStyle.Fill,
            Padding = new Padding(24, 20, 24, 20),
            BackColor = Theme.Background,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        _apiBase = new TextBox
        {
            Text = _config.ApiBase.Length > 0 ? _config.ApiBase : DefaultApiBase,
            Width = ContentWidth,
            BackColor = Theme.Surface,
            ForeColor = Theme.Text,
            BorderStyle = BorderStyle.FixedSingle,
            Margin = new Padding(0, 2, 0, 14),
        };

        _token = new TextBox
        {
            Width = ContentWidth,
            BackColor = Theme.Surface,
            ForeColor = Theme.Text,
            BorderStyle = BorderStyle.FixedSingle,
            Margin = new Padding(0, 2, 0, 18),
        };

        _pair = new Button
        {
            Text = "Pair",
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Padding = new Padding(24, 8, 24, 8),
            BackColor = Theme.Accent,
            ForeColor = Color.Black,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 0, 0, 12),
        };
        _pair.FlatAppearance.BorderSize = 0;
        _pair.Click += async (_, _) => await PairAsync();

        _error = new Label
        {
            ForeColor = Theme.Bad,
            AutoSize = true,
            MaximumSize = new Size(ContentWidth, 0),
            Visible = false,
            Margin = new Padding(0, 0, 0, 10),
        };

        layout.Controls.Add(Heading("Pair this computer"));
        layout.Controls.Add(Prose(
            "On Insight, open Devices, generate a Windows pairing code, and paste "
            + "it below. It is shown once."));
        layout.Controls.Add(FieldLabel("Insight address"));
        layout.Controls.Add(_apiBase);
        layout.Controls.Add(FieldLabel("Pairing code"));
        layout.Controls.Add(_token);
        layout.Controls.Add(_pair);
        layout.Controls.Add(_error);
        layout.Controls.Add(Footnote(
            "This computer never receives your encryption password, and never reads "
            + "window titles — only which apps were in front."));

        Controls.Add(layout);

        // Asked for once everything is in, so the window fits its contents at
        // whatever size this display renders them.
        ClientSize = layout.PreferredSize;

        AcceptButton = _pair;
    }

    private static Label Heading(string text) => new()
    {
        Text = text,
        Font = Theme.Heading,
        ForeColor = Theme.Text,
        AutoSize = true,
        MaximumSize = new Size(ContentWidth, 0),
        Margin = new Padding(0, 0, 0, 8),
    };

    private static Label Prose(string text) => new()
    {
        Text = text,
        ForeColor = Theme.TextMuted,
        AutoSize = true,
        MaximumSize = new Size(ContentWidth, 0),
        Margin = new Padding(0, 0, 0, 16),
    };

    private static Label FieldLabel(string text) => new()
    {
        Text = text,
        ForeColor = Theme.TextMuted,
        AutoSize = true,
        Margin = new Padding(0, 0, 0, 2),
    };

    private static Label Footnote(string text) => new()
    {
        Text = text,
        ForeColor = Theme.TextFaint,
        Font = Theme.Small,
        AutoSize = true,
        MaximumSize = new Size(ContentWidth, 0),
        Margin = new Padding(0),
    };

    private static string TrimBase(string url) => url.Trim().TrimEnd('/');

    private void Fail(string message)
    {
        _error.Text = message;
        _error.Visible = true;
    }

    private async Task PairAsync()
    {
        string apiBase = TrimBase(_apiBase.Text);
        string token = _token.Text.Trim();

        _error.Visible = false;

        if (apiBase.Length == 0 || token.Length == 0)
        {
            Fail("Both fields are needed.");
            return;
        }
        if (!Address.IsAcceptable(apiBase, out string problem))
        {
            Fail(problem);
            return;
        }

        _pair.Enabled = false;
        _pair.Text = "Checking…";

        try
        {
            PollResult result = await _tracker.VerifyAsync(apiBase, token);

            // Each failure is named separately. Grouping them blames a bad
            // code on the network and sends you looking at the wrong thing —
            // the same mistake as any error message that guesses.
            switch (result.Status)
            {
                case PollStatus.Unauthorised:
                    Fail("That code wasn't accepted. Generate a new one on the website.");
                    return;
                case PollStatus.Unreachable:
                    Fail($"Couldn't reach {apiBase}. Check the address and your connection.");
                    return;
            }

            _tracker.ApplyPairing(apiBase, token, result);
            Close();
        }
        finally
        {
            if (!IsDisposed)
            {
                _pair.Enabled = true;
                _pair.Text = "Pair";
            }
        }
    }
}
