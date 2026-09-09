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
    internal static readonly Color Background = Color.FromArgb(0x13, 0x13, 0x16);
    internal static readonly Color Surface = Color.FromArgb(0x1B, 0x1B, 0x20);
    internal static readonly Color Line = Color.FromArgb(0x26, 0x26, 0x2C);
    internal static readonly Color Text = Color.FromArgb(0xED, 0xED, 0xF0);
    internal static readonly Color TextMuted = Color.FromArgb(0x9C, 0x9C, 0xA8);
    internal static readonly Color TextFaint = Color.FromArgb(0x7A, 0x7A, 0x87);
    internal static readonly Color Accent = Color.FromArgb(0x1F, 0xA9, 0x7A);
    internal static readonly Color Good = Color.FromArgb(0x3F, 0xBF, 0x8F);
    internal static readonly Color Bad = Color.FromArgb(0xE2, 0x56, 0x3F);

    internal static readonly Font Body = new("Segoe UI", 10F);
    internal static readonly Font Heading = new("Segoe UI Semibold", 13F);
    internal static readonly Font Small = new("Segoe UI", 8.5F);
}
