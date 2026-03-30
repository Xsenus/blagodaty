namespace Blagodaty.Api.Models;

public sealed class UserExternalIdentity
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public string Provider { get; set; } = string.Empty;
    public string ProviderUserId { get; set; } = string.Empty;
    public string? ProviderEmail { get; set; }
    public bool ProviderEmailVerified { get; set; }
    public string? ProviderUsername { get; set; }
    public string? DisplayName { get; set; }
    public string? AvatarUrl { get; set; }
    public string? ProfileUrl { get; set; }
    public string? RawProfileJson { get; set; }
    public long? TelegramChatId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? VerifiedAtUtc { get; set; }
    public DateTime? LastUsedAtUtc { get; set; }
    public DateTime? LastSyncedAtUtc { get; set; }
}
