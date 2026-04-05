namespace Blagodaty.Api.Options;

public sealed class PhoneVerificationOptions
{
    public const string SectionName = "PhoneVerification";

    public string Mode { get; set; } = "Debug";
    public int CodeLength { get; set; } = 4;
    public int CodeTtlMinutes { get; set; } = 10;
    public int ResendCooldownSeconds { get; set; } = 30;
    public int MaxAttempts { get; set; } = 5;
}
