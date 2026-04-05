using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Account;

public sealed class SendPhoneVerificationCodeRequest
{
    [Required, Phone, MaxLength(32)]
    public string PhoneNumber { get; set; } = string.Empty;
}

public sealed class SendPhoneVerificationCodeResponse
{
    public required string PhoneNumber { get; init; }
    public required DateTime ExpiresAtUtc { get; init; }
    public required int ResendCooldownSeconds { get; init; }
    public required bool AlreadyVerified { get; init; }
    public required bool IsTestMode { get; init; }
    public string? DebugCode { get; init; }
    public string? Message { get; init; }
}

public sealed class VerifyPhoneVerificationCodeRequest
{
    [Required, Phone, MaxLength(32)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required, StringLength(12, MinimumLength = 4)]
    public string Code { get; set; } = string.Empty;
}

public sealed class VerifyPhoneVerificationCodeResponse
{
    public required string PhoneNumber { get; init; }
    public required bool Verified { get; init; }
}
