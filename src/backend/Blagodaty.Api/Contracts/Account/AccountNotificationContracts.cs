using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Account;

public sealed class AccountNotificationDto
{
    public required Guid Id { get; init; }
    public required UserNotificationType Type { get; init; }
    public required NotificationSeverity Severity { get; init; }
    public required string Title { get; init; }
    public required string Message { get; init; }
    public string? LinkUrl { get; init; }
    public Guid? EventEditionId { get; init; }
    public Guid? RegistrationId { get; init; }
    public string? EventSlug { get; init; }
    public string? EventTitle { get; init; }
    public bool IsRead { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? ReadAtUtc { get; init; }
}

public sealed class AccountNotificationsResponse
{
    public required IReadOnlyCollection<AccountNotificationDto> Items { get; init; }
    public required int Page { get; init; }
    public required int PageSize { get; init; }
    public required int TotalItems { get; init; }
    public required int TotalPages { get; init; }
    public required int UnreadCount { get; init; }
}

public sealed class AccountNotificationsQueryRequest
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public bool UnreadOnly { get; init; }
}
