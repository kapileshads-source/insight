using System.Runtime.InteropServices;
using System.Text;

namespace Insight;

/// <summary>
/// The Win32 surface this app uses, and deliberately nothing more.
///
/// Note what is absent: <c>GetWindowText</c>. Reading window titles is one
/// call away and would be the easiest way to learn what a student is actually
/// doing — which document, which video, which conversation. Not importing it
/// is how "app names only" stays true by construction rather than by promise,
/// the same way the extension truncates URLs at the hostname.
/// </summary>
internal static class Native
{
    [DllImport("user32.dll")]
    internal static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    internal static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    internal static extern bool ShowWindow(IntPtr hWnd, int cmd);

    internal const int SW_MINIMIZE = 6;

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO info);

    /// <summary>
    /// How long since the keyboard or mouse was last touched.
    ///
    /// A laptop left open with a game in the foreground would otherwise bill a
    /// student for hours they were not at the desk. The browser extension has
    /// no equivalent problem — a tab loses focus when they walk away from the
    /// machine only in the sense that nothing changes — so this is the one
    /// place the two implementations differ on purpose.
    /// </summary>
    internal static TimeSpan IdleFor()
    {
        var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref info)) return TimeSpan.Zero;

        // Unsigned subtraction, so the 49-day tick wrap is a small number
        // rather than a 49-day idle spike.
        uint elapsed = unchecked((uint)Environment.TickCount - info.dwTime);
        return TimeSpan.FromMilliseconds(elapsed);
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr OpenInputDesktop(uint flags, bool inherit, uint access);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool CloseDesktop(IntPtr desktop);

    /// <summary>
    /// True when the workstation is locked, or the screen saver has it.
    ///
    /// Keyboard idle alone is not a safe signal. Measured on a real MacBook,
    /// the trackpad emits events by itself every few minutes with nobody near
    /// it — well inside any threshold worth setting — so the idle rule there
    /// never fired once and an evening with the lid open counted as study
    /// time in full. Windows has no shortage of equivalents: a wireless mouse
    /// on an uneven desk, a presence sensor, a jiggler.
    ///
    /// A locked desktop cannot be produced by a stray touch and has no
    /// innocent reading. `OpenInputDesktop` fails for the calling process when
    /// the secure desktop is in front, which is exactly that condition.
    /// </summary>
    internal static bool ScreenLocked()
    {
        const uint DESKTOP_SWITCHDESKTOP = 0x0100;

        IntPtr desktop = OpenInputDesktop(0, false, DESKTOP_SWITCHDESKTOP);
        if (desktop == IntPtr.Zero) return true;

        CloseDesktop(desktop);
        return false;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(int processId);

    [DllImport("kernel32.dll")]
    private static extern bool AllocConsole();

    /// A WinExe has no console, so `--self-test` borrows the one it was
    /// launched from.
    internal static void AttachToParentConsole()
    {
        if (!AttachConsole(-1)) AllocConsole();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr ShellExecute(
        IntPtr hwnd, string? verb, string file, string? parameters, string? directory, int show);

    /// Open a URL in the student's own browser.
    internal static void OpenUrl(string url)
    {
        if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }
        ShellExecute(IntPtr.Zero, "open", url, null, null, 1);
    }

    [DllImport("user32.dll")]
    internal static extern bool DestroyIcon(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(
        IntPtr process, uint flags, StringBuilder exeName, ref int size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr handle);

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    /// <summary>
    /// Full path of a process's executable.
    ///
    /// <c>Process.MainModule</c> throws for anything running at a higher
    /// integrity level, which on a school laptop is a great deal — and the
    /// symptom would be a student's most-used apps quietly missing from their
    /// figures. This asks for the least privilege that answers the question.
    /// </summary>
    internal static string? ExecutablePath(uint processId)
    {
        IntPtr handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, processId);
        if (handle == IntPtr.Zero) return null;

        try
        {
            int size = 1024;
            var buffer = new StringBuilder(size);
            return QueryFullProcessImageName(handle, 0, buffer, ref size)
                ? buffer.ToString()
                : null;
        }
        finally
        {
            CloseHandle(handle);
        }
    }
}
