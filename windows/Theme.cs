using System.Drawing;

namespace Insight;

/// <summary>
/// Enough of the website's look that the two feel like one product.
///
/// A student pairs this from a dark page and then meets a grey Windows dialog;
/// matching the surface, line and text colours is most of what stops that
/// feeling like a different, less trustworthy program.
/// </summary>
internal static class Theme
{
    internal static readonly Color Background = Color.FromArgb(0x0E, 0x0F, 0x11);
    internal static readonly Color Surface = Color.FromArgb(0x16, 0x18, 0x1B);
    internal static readonly Color Line = Color.FromArgb(0x2A, 0x2D, 0x31);
    internal static readonly Color Text = Color.FromArgb(0xEC, 0xED, 0xEE);
    internal static readonly Color TextMuted = Color.FromArgb(0x9B, 0xA1, 0xA6);
    internal static readonly Color TextFaint = Color.FromArgb(0x6E, 0x74, 0x7A);
    internal static readonly Color Accent = Color.FromArgb(0x5B, 0xA8, 0xF5);
    internal static readonly Color Good = Color.FromArgb(0x4A, 0xC3, 0x8A);
    internal static readonly Color Bad = Color.FromArgb(0xE5, 0x7A, 0x7A);

    internal static readonly Font Body = new("Segoe UI", 10F);
    internal static readonly Font Heading = new("Segoe UI Semibold", 13F);
    internal static readonly Font Small = new("Segoe UI", 8.5F);
}
