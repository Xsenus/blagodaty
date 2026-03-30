using Microsoft.AspNetCore.Identity;

namespace Blagodaty.Api.Models;

public sealed class ApplicationUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? City { get; set; }
    public string? ChurchName { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAtUtc { get; set; }

    public ICollection<CampRegistration> CampRegistrations { get; set; } = [];
    public ICollection<RefreshSession> RefreshSessions { get; set; } = [];
    public ICollection<UserExternalIdentity> ExternalIdentities { get; set; } = [];
    public ICollection<UserNotification> Notifications { get; set; } = [];
}
