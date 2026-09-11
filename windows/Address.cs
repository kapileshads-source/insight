using System.Net;

namespace Insight;

/// <summary>
/// Whether an Insight address is safe to send a pairing code to.
///
/// The pairing screen used to accept any `http://` address. Everything this
/// app sends, the pairing code itself, then every app name during every
/// session, would then cross the network in clear text, readable by anyone
/// else on the school's wifi. A student typing "http" out of habit is not
/// making an informed choice about that.
///
/// So: https, or a local address. Plain http is still allowed to localhost and
/// to private LAN ranges, because that is how the app is developed and tested
/// against a laptop on the same network, and traffic that never leaves the
/// building is a different proposition to traffic that crosses the internet.
/// </summary>
internal static class Address
{
    internal static bool IsAcceptable(string input, out string problem)
    {
        problem = "";

        if (!Uri.TryCreate(input.Trim(), UriKind.Absolute, out Uri? uri))
        {
            problem = "That doesn't look like a web address.";
            return false;
        }

        if (uri.Scheme == Uri.UriSchemeHttps) return true;

        if (uri.Scheme != Uri.UriSchemeHttp)
        {
            problem = "The address should start with https://";
            return false;
        }

        if (IsLocal(uri.Host)) return true;

        problem =
            "That address isn't secure. Use https://, over plain http your "
            + "pairing code and everything this app records could be read by "
            + "anyone else on the network.";
        return false;
    }

    private static bool IsLocal(string host)
    {
        if (host.Equals("localhost", StringComparison.OrdinalIgnoreCase)) return true;
        if (host.EndsWith(".local", StringComparison.OrdinalIgnoreCase)) return true;

        if (!IPAddress.TryParse(host.Trim('[', ']'), out IPAddress? ip)) return false;

        if (IPAddress.IsLoopback(ip)) return true;

        byte[] bytes = ip.GetAddressBytes();
        if (bytes.Length != 4) return false;

        // 10/8, 172.16/12, 192.168/16, and 169.254/16 for link-local.
        return bytes[0] switch
        {
            10 => true,
            172 => bytes[1] >= 16 && bytes[1] <= 31,
            192 => bytes[1] == 168,
            169 => bytes[1] == 254,
            _ => false,
        };
    }
}
