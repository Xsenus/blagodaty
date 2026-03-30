using Blagodaty.Api.Contracts.Account;

namespace Blagodaty.Api.Contracts.Auth;

public sealed class AuthResponse
{
    public required string AccessToken { get; init; }
    public required string RefreshToken { get; init; }
    public required DateTime AccessTokenExpiresAtUtc { get; init; }
    public required DateTime RefreshTokenExpiresAtUtc { get; init; }
    public required UserSummaryDto User { get; init; }
}
