namespace Insight;

/// <summary>
/// Insight for Windows.
///
/// Counts time per app while a study session is running, and gets blocked apps
/// out of the way while Focus Mode is on — the desktop half of what the
/// browser extension does for websites. It talks to the same two endpoints the
/// extension does and adds nothing to the server.
///
/// The rules it lives by are in <see cref="Tracker"/>; the reason window
/// titles are unreachable from here is in <see cref="Native"/>.
/// </summary>
internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--self-test") return SelfTest.Run();

        // One instance. Two would double-count every second, and the second
        // one's tally would land in the same staging rows looking like the
        // student used everything twice.
        using var single = new Mutex(true, @"Local\Insight.Windows", out bool first);
        if (!first) return 0;

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.SetHighDpiMode(HighDpiMode.SystemAware);

        // Installed explicitly rather than waiting for the first control, so
        // the tracker can rely on posting machine-state events — sleep, screen
        // lock — to the thread that owns the tally.
        if (SynchronizationContext.Current is not WindowsFormsSynchronizationContext)
        {
            SynchronizationContext.SetSynchronizationContext(
                new WindowsFormsSynchronizationContext());
        }

        using var app = new TrayApp();
        Application.Run();
        return 0;
    }
}
