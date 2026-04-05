namespace Blagodaty.Api.Models;

public sealed class PhoneVerificationChallenge
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string PhoneNumber { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public int Attempts { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
}
