namespace Blagodaty.Api.Models;

public sealed class SessionTransferChallenge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public string? CreatedByIp { get; set; }
    public string? UserAgent { get; set; }

    public bool IsActive(DateTime utcNow) => ConsumedAtUtc is null && ExpiresAtUtc > utcNow;
}
