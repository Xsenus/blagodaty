namespace Blagodaty.Api.Contracts.Account;

public sealed class ExternalIdentityDto
{
    public required string Provider { get; init; }
    public required string DisplayName { get; init; }
    public string? ProviderUsername { get; init; }
    public string? ProviderEmail { get; init; }
    public bool ProviderEmailVerified { get; init; }
    public string? AvatarUrl { get; init; }
    public string? ProfileUrl { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? VerifiedAtUtc { get; init; }
    public DateTime? LastUsedAtUtc { get; init; }
}
