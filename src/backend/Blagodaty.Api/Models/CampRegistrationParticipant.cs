namespace Blagodaty.Api.Models;

public sealed class CampRegistrationParticipant
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CampRegistrationId { get; set; }
    public CampRegistration CampRegistration { get; set; } = null!;
    public string FullName { get; set; } = string.Empty;
    public bool IsChild { get; set; }
    public int SortOrder { get; set; }
}
