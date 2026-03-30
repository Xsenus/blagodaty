namespace Blagodaty.Api.Models;

public sealed class AuthEvent
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string? Detail { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}
