namespace Blagodaty.Api.Models;

public sealed class ExternalAuthRequest
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string Provider { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
    public ExternalAuthIntent Intent { get; set; }
    public ExternalAuthRequestStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public string? CodeVerifier { get; set; }
    public string? DeviceId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
}
