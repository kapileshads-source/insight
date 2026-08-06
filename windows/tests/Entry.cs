namespace Insight;

/// The app's own entry point lives in Program.cs, which isn't linked here
/// because it needs a desktop. This is the same tests, one call deep.
internal static class Entry
{
    private static int Main() => SelfTest.Run();
}
