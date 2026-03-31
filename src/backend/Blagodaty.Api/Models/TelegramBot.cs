namespace Blagodaty.Api.Models;

public sealed class TelegramChat
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public long ChatId { get; set; }
    public TelegramChatKind Kind { get; set; } = TelegramChatKind.Unknown;
    public string? Title { get; set; }
    public string? Username { get; set; }
    public bool IsForum { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAtUtc { get; set; }

    public ICollection<TelegramChatSubscription> Subscriptions { get; set; } = [];
    public ICollection<TelegramCommandLog> CommandLogs { get; set; } = [];
}

public sealed class TelegramChatSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TelegramChatId { get; set; }
    public TelegramChat Chat { get; set; } = null!;
    public Guid EventEditionId { get; set; }
    public EventEdition EventEdition { get; set; } = null!;
    public TelegramChatSubscriptionType SubscriptionType { get; set; } = TelegramChatSubscriptionType.RegistrationSubmitted;
    public bool IsEnabled { get; set; } = true;
    public long? MessageThreadId { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<TelegramSubscriptionDeliveryLog> DeliveryLogs { get; set; } = [];
}

public sealed class TelegramCommandLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? TelegramChatId { get; set; }
    public TelegramChat? Chat { get; set; }
    public long? TelegramUserId { get; set; }
    public string? TelegramUsername { get; set; }
    public Guid? UserId { get; set; }
    public ApplicationUser? User { get; set; }
    public string Command { get; set; } = string.Empty;
    public string? Arguments { get; set; }
    public TelegramCommandLogStatus Status { get; set; } = TelegramCommandLogStatus.Handled;
    public string? ResponsePreview { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class TelegramSubscriptionDeliveryLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TelegramChatSubscriptionId { get; set; }
    public TelegramChatSubscription Subscription { get; set; } = null!;
    public string NotificationKey { get; set; } = string.Empty;
    public DateTime SentAtUtc { get; set; } = DateTime.UtcNow;
}

public enum TelegramChatKind
{
    Unknown = 0,
    Private = 1,
    Group = 2,
    Supergroup = 3,
    Channel = 4
}

public enum TelegramChatSubscriptionType
{
    RegistrationSubmitted = 0,
    RegistrationStatusChanged = 1,
    RegistrationClosingSoon = 2
}

public enum TelegramCommandLogStatus
{
    Handled = 0,
    Ignored = 1,
    Forbidden = 2,
    Failed = 3
}
