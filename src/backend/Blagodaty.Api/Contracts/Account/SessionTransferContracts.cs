using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Account;

public sealed class CreateSessionTransferResponse
{
    public required string Token { get; init; }
    public required DateTime ExpiresAtUtc { get; init; }
}

public sealed class RedeemSessionTransferRequest
{
    [Required, StringLength(256, MinimumLength = 32)]
    public string Token { get; set; } = string.Empty;
}
