namespace Blagodaty.Api.Contracts.Auth;

public sealed class ExternalAuthStartResponse
{
    public required string Provider { get; init; }
    public required string Intent { get; init; }
    public required string State { get; init; }
    public required string AuthUrl { get; init; }
    public string? ReturnUrl { get; init; }
    public DateTime ExpiresAtUtc { get; init; }
    public int PollIntervalMs { get; init; } = 2000;
}
