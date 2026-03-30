using Blagodaty.Api.Contracts.Account;

namespace Blagodaty.Api.Contracts.Auth;

public sealed class ExternalAuthStatusResponse
{
    public required string Status { get; init; }
    public bool Completed { get; init; }
    public string? Provider { get; init; }
    public bool Linked { get; init; }
    public string? ReturnUrl { get; init; }
    public string? Message { get; init; }
    public AuthResponse? Auth { get; init; }
    public ExternalIdentityDto? Identity { get; init; }
}
