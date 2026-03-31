using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminTelegramOverviewResponse
{
    public required AdminTelegramSummaryDto Summary { get; init; }
    public required IReadOnlyCollection<AdminTelegramEventOptionDto> Events { get; init; }
    public required IReadOnlyCollection<AdminTelegramChatDto> Chats { get; init; }
    public required IReadOnlyCollection<AdminTelegramCommandLogDto> RecentCommands { get; init; }
}

public sealed class AdminTelegramSummaryDto
{
    public int TotalChats { get; init; }
    public int ActiveChats { get; init; }
    public int TotalSubscriptions { get; init; }
    public int RecentCommandsCount { get; init; }
}

public sealed class AdminTelegramEventOptionDto
{
    public Guid Id { get; init; }
    public string Slug { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public EventEditionStatus Status { get; init; }
}

public sealed class AdminTelegramChatDto
{
    public Guid Id { get; init; }
    public long ChatId { get; init; }
    public TelegramChatKind Kind { get; init; }
    public string? Title { get; init; }
    public string? Username { get; init; }
    public bool IsForum { get; init; }
    public bool IsActive { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public DateTime? LastSeenAtUtc { get; init; }
    public IReadOnlyCollection<AdminTelegramChatSubscriptionDto> Subscriptions { get; init; } = Array.Empty<AdminTelegramChatSubscriptionDto>();
}

public sealed class AdminTelegramChatSubscriptionDto
{
    public Guid Id { get; init; }
    public Guid EventEditionId { get; init; }
    public string EventSlug { get; init; } = string.Empty;
    public string EventTitle { get; init; } = string.Empty;
    public TelegramChatSubscriptionType SubscriptionType { get; init; }
    public bool IsEnabled { get; init; }
    public long? MessageThreadId { get; init; }
    public Guid? CreatedByUserId { get; init; }
    public string? CreatedByDisplayName { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
}

public sealed class AdminTelegramCommandLogDto
{
    public Guid Id { get; init; }
    public Guid? TelegramChatId { get; init; }
    public string? ChatTitle { get; init; }
    public long? ChatExternalId { get; init; }
    public long? TelegramUserId { get; init; }
    public string? TelegramUsername { get; init; }
    public Guid? UserId { get; init; }
    public string? UserDisplayName { get; init; }
    public string Command { get; init; } = string.Empty;
    public string? Arguments { get; init; }
    public TelegramCommandLogStatus Status { get; init; }
    public string? ResponsePreview { get; init; }
    public DateTime CreatedAtUtc { get; init; }
}

public sealed class CreateAdminTelegramSubscriptionRequest
{
    public Guid TelegramChatId { get; init; }
    public Guid EventEditionId { get; init; }
    public TelegramChatSubscriptionType SubscriptionType { get; init; }
    public long? MessageThreadId { get; init; }
    public bool IsEnabled { get; init; } = true;
}

public sealed class UpdateAdminTelegramSubscriptionRequest
{
    public bool IsEnabled { get; init; }
    public long? MessageThreadId { get; init; }
}

public sealed class UpdateAdminTelegramChatRequest
{
    public bool IsActive { get; init; }
}
