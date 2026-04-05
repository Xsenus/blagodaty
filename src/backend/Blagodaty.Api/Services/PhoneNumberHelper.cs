using System.Text;

namespace Blagodaty.Api.Services;

public static class PhoneNumberHelper
{
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        var digits = new StringBuilder(trimmed.Length);
        foreach (var character in trimmed)
        {
            if (char.IsDigit(character))
            {
                digits.Append(character);
            }
        }

        if (digits.Length == 0)
        {
            return trimmed;
        }

        var normalizedDigits = digits.ToString();
        if (normalizedDigits.Length == 11 && normalizedDigits[0] == '8')
        {
            normalizedDigits = $"7{normalizedDigits[1..]}";
        }

        return normalizedDigits.Length >= 10
            ? $"+{normalizedDigits}"
            : trimmed;
    }
}
