namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminExternalAuthEventDto
{
    public Guid Id { get; init; }
    public Guid? UserId { get; init; }
    public string Provider { get; init; } = string.Empty;
    public string EventType { get; init; } = string.Empty;
    public string? Detail { get; init; }
    public DateTime CreatedAtUtc { get; init; }
}
