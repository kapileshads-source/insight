using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace Insight;

internal sealed record SessionState(string Id, DateTimeOffset StartedAt, bool FocusMode);

internal enum PollStatus
{
    Ok,
    /// The token was revoked, or was never right. Distinct from a failure
    /// because it is permanent and the student has to do something about it.
    Unauthorised,
    Unreachable,
}

internal sealed record PollResult(
    PollStatus Status,
    SessionState? Session,
    List<string> Blocklist);

internal sealed record DomainTime(string Domain, int Seconds);

internal sealed record BlockEvent(string Site, bool OverrideUsed);

/// <summary>
/// The two endpoints this app talks to. Both already existed for the
/// extension; nothing here is Windows-specific except the user agent.
/// </summary>
internal sealed class ApiClient
{
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly Config _config;

    internal ApiClient(Config config)
    {
        _config = config;
        _http.DefaultRequestHeaders.Add("User-Agent", "Insight-Windows/0.1");
    }

    private HttpRequestMessage Request(HttpMethod method, string path, string? apiBase, string? token)
    {
        var request = new HttpRequestMessage(method, (apiBase ?? _config.ApiBase) + path);
        request.Headers.Add("Authorization", "Bearer " + (token ?? _config.Token));
        return request;
    }

    /// <summary>
    /// Ask whether a session is running, and get the current blocklist.
    ///
    /// The website owns session state and this app only follows, exactly as
    /// the extension does, so starting a session on a phone starts recording
    /// on the laptop, and a student is never told two different things about
    /// whether they are studying.
    ///
    /// <paramref name="apiBase"/> and <paramref name="token"/> are for the
    /// pairing screen, which has to verify a code before saving it.
    /// </summary>
    internal async Task<PollResult> PollAsync(string? apiBase = null, string? token = null)
    {
        try
        {
            using HttpRequestMessage request =
                Request(HttpMethod.Get, "/api/devices/session", apiBase, token);
            using HttpResponseMessage response = await _http.SendAsync(request).ConfigureAwait(false);

            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                return new PollResult(PollStatus.Unauthorised, null, new List<string>());
            }
            if (!response.IsSuccessStatusCode)
            {
                return new PollResult(PollStatus.Unreachable, null, new List<string>());
            }

            string body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return Parse(body);
        }
        catch
        {
            return new PollResult(PollStatus.Unreachable, null, new List<string>());
        }
    }

    /// Split out so <see cref="SelfTest"/> can check the shape of what the
    /// server sends without a network.
    internal static PollResult Parse(string body)
    {
        using JsonDocument document = JsonDocument.Parse(body);
        JsonElement root = document.RootElement;

        SessionState? session = null;
        if (root.TryGetProperty("session", out JsonElement s) &&
            s.ValueKind == JsonValueKind.Object)
        {
            string id = s.GetProperty("id").GetString() ?? "";
            DateTimeOffset startedAt = s.TryGetProperty("startedAt", out JsonElement started) &&
                DateTimeOffset.TryParse(started.GetString(), out DateTimeOffset parsed)
                    ? parsed
                    : DateTimeOffset.UtcNow;
            bool focus = s.TryGetProperty("focusMode", out JsonElement f) &&
                f.ValueKind == JsonValueKind.True;

            if (id.Length > 0) session = new SessionState(id, startedAt, focus);
        }

        var blocklist = new List<string>();
        if (root.TryGetProperty("blocklist", out JsonElement list) &&
            list.ValueKind == JsonValueKind.Array)
        {
            foreach (JsonElement entry in list.EnumerateArray())
            {
                string? value = entry.GetString();
                if (!string.IsNullOrWhiteSpace(value)) blocklist.Add(value.ToLowerInvariant());
            }
        }

        return new PollResult(PollStatus.Ok, session, blocklist);
    }

    /// <summary>
    /// Report what was used. App names go in the <c>domain</c> field, which is
    /// what the endpoint's author intended for the native apps.
    ///
    /// Returns false on anything other than a clean success, and the caller
    /// keeps its tally, a dropped connection should delay the data rather
    /// than destroy it.
    /// </summary>
    internal async Task<bool> PostActivityAsync(
        string sessionId, IReadOnlyList<DomainTime> domains, IReadOnlyList<BlockEvent> blocked)
    {
        var payload = new
        {
            sessionId,
            domains = domains.Select(d => new { domain = d.Domain, seconds = d.Seconds }),
            blocked = blocked.Select(b => new { site = b.Site, overrideUsed = b.OverrideUsed }),
        };

        try
        {
            using HttpRequestMessage request =
                Request(HttpMethod.Post, "/api/devices/activity", null, null);
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

            using HttpResponseMessage response = await _http.SendAsync(request).ConfigureAwait(false);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}
