namespace Blagodaty.Api.Models;

public sealed class TelegramAuthRequest
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string State { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
    public ExternalAuthIntent Intent { get; set; }
    public ExternalAuthRequestStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public string? TelegramUserId { get; set; }
    public string? TelegramUsername { get; set; }
    public string? TelegramDisplayName { get; set; }
    public long? TelegramChatId { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
}
