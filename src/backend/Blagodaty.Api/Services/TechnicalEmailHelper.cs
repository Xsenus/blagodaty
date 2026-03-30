using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;

namespace Blagodaty.Api.Services;

public static class TechnicalEmailHelper
{
    private const string TechnicalDomain = "auth.blagodaty.invalid";

    public static string NormalizeProvider(string? provider)
    {
        return provider?.Trim().ToLowerInvariant() switch
        {
            "google" => "google",
            "vk" or "vkontakte" => "vk",
            "yandex" => "yandex",
            "telegram" => "telegram",
            _ => string.Empty
        };
    }

    public static string? NormalizeRealEmail(string? email)
    {
        if (!IsValidRealEmail(email))
        {
            return null;
        }

        return email!.Trim().ToLowerInvariant();
    }

    public static bool IsValidRealEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || IsTechnicalEmail(email))
        {
            return false;
        }

        try
        {
            var parsed = new MailAddress(email.Trim());
            return !string.IsNullOrWhiteSpace(parsed.Address);
        }
        catch
        {
            return false;
        }
    }

    public static string BuildTechnicalEmail(string provider, string providerUserId)
    {
        var normalizedProvider = NormalizeProvider(provider);
        var normalizedUserId = (providerUserId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedProvider) || string.IsNullOrWhiteSpace(normalizedUserId))
        {
            throw new InvalidOperationException("Provider and provider user id are required for a technical email.");
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(normalizedUserId))).ToLowerInvariant();
        return $"{normalizedProvider}.{hash[..24]}@{TechnicalDomain}";
    }

    public static bool IsTechnicalEmail(string? email)
    {
        var normalized = email?.Trim().ToLowerInvariant();
        return !string.IsNullOrWhiteSpace(normalized) && normalized.EndsWith("@" + TechnicalDomain, StringComparison.Ordinal);
    }

    public static string ToVisibleEmail(string? email)
    {
        return IsValidRealEmail(email) ? email!.Trim() : string.Empty;
    }
}
