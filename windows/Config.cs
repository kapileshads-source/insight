using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Insight;

/// <summary>
/// The only thing this app keeps on disk: where Insight is, and the pairing
/// token.
///
/// Not the tally. Recorded time lives in memory and is sent every minute, so a
/// machine that is switched off — or examined by someone who isn't the student
/// — has nothing on it saying which apps they used. That is a stronger promise
/// than the extension can make, since <c>chrome.storage</c> is a plaintext
/// file, and it costs only the last minute of a session if the app is killed.
///
/// The token is wrapped with DPAPI under the current Windows user, so another
/// account on a shared family laptop can't lift it out of AppData and post
/// activity as this student. It is not protection against that student's own
/// account, and nothing here could be.
/// </summary>
internal sealed class Config
{
    public string ApiBase { get; set; } = "";
    public string Token { get; set; } = "";

    public bool Paired => ApiBase.Length > 0 && Token.Length > 0;

    private static string Directory => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Insight");

    private static string FilePath => Path.Combine(Directory, "config.json");

    private sealed class Stored
    {
        public string ApiBase { get; set; } = "";
        /// Base64 of the DPAPI blob. Never the token itself.
        public string TokenProtected { get; set; } = "";
    }

    internal static Config Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return new Config();

            Stored? stored = JsonSerializer.Deserialize<Stored>(File.ReadAllText(FilePath));
            if (stored is null) return new Config();

            return new Config
            {
                ApiBase = stored.ApiBase,
                Token = Unprotect(stored.TokenProtected),
            };
        }
        catch
        {
            // A corrupt config means "not paired", which the tray says plainly
            // and a student fixes in ten seconds. Throwing here would mean an
            // app that won't start and doesn't say why.
            return new Config();
        }
    }

    internal void Save()
    {
        System.IO.Directory.CreateDirectory(Directory);

        var stored = new Stored { ApiBase = ApiBase, TokenProtected = Protect(Token) };
        File.WriteAllText(FilePath, JsonSerializer.Serialize(stored));
    }

    /// Unpairing leaves nothing behind, the same as the extension's popup.
    internal void Clear()
    {
        ApiBase = "";
        Token = "";
        try
        {
            if (File.Exists(FilePath)) File.Delete(FilePath);
        }
        catch
        {
            // Deleted-but-unwritable is not a state worth crashing over; the
            // in-memory clear above already stopped all reporting.
        }
    }

    private static string Protect(string value)
    {
        if (value.Length == 0) return "";

        byte[] blob = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser);
        return Convert.ToBase64String(blob);
    }

    private static string Unprotect(string value)
    {
        if (string.IsNullOrEmpty(value)) return "";

        try
        {
            byte[] plain = ProtectedData.Unprotect(
                Convert.FromBase64String(value), null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plain);
        }
        catch
        {
            // Copied from another machine or another Windows account. The
            // token is unrecoverable, which is the point.
            return "";
        }
    }
}
