namespace Blagodaty.Api.Models;

public sealed class UserNotification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid? EventEditionId { get; set; }
    public EventEdition? EventEdition { get; set; }
    public Guid? RegistrationId { get; set; }
    public CampRegistration? Registration { get; set; }
    public UserNotificationType Type { get; set; } = UserNotificationType.Generic;
    public NotificationSeverity Severity { get; set; } = NotificationSeverity.Info;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? LinkUrl { get; set; }
    public string? DeduplicationKey { get; set; }
    public bool IsRead { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAtUtc { get; set; }
}

public enum UserNotificationType
{
    Generic = 0,
    RegistrationSubmitted = 1,
    RegistrationStatusChanged = 2,
    RegistrationClosingSoon = 3
}

public enum NotificationSeverity
{
    Info = 0,
    Success = 1,
    Warning = 2
}
