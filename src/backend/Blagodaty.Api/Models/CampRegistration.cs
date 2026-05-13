namespace Blagodaty.Api.Models;

public sealed class CampRegistration
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public Guid? EventEditionId { get; set; }
    public EventEdition? EventEdition { get; set; }
    public Guid? SelectedPriceOptionId { get; set; }
    public EventPriceOption? SelectedPriceOption { get; set; }

    public RegistrationStatus Status { get; set; } = RegistrationStatus.Draft;
    public string ContactEmail { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public DateOnly BirthDate { get; set; }
    public string City { get; set; } = string.Empty;
    public string ChurchName { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public bool HasCar { get; set; }
    public bool HasChildren { get; set; }
    public int ParticipantsCount { get; set; } = 1;
    public string EmergencyContactName { get; set; } = string.Empty;
    public string EmergencyContactPhone { get; set; } = string.Empty;
    public AccommodationPreference AccommodationPreference { get; set; } = AccommodationPreference.Tent;
    public string? HealthNotes { get; set; }
    public string? AllergyNotes { get; set; }
    public string? SpecialNeeds { get; set; }
    public string? Motivation { get; set; }
    public bool ConsentAccepted { get; set; }
    public bool IsPaid { get; set; }
    public DateTime? PaidAtUtc { get; set; }
    public Guid? PaymentUpdatedByUserId { get; set; }
    public ApplicationUser? PaymentUpdatedByUser { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? SubmittedAtUtc { get; set; }

    public ICollection<CampRegistrationParticipant> Participants { get; set; } = [];
    public ICollection<CampRegistrationHistoryEntry> HistoryEntries { get; set; } = [];
}

public sealed class CampRegistrationHistoryEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CampRegistrationId { get; set; }
    public CampRegistration CampRegistration { get; set; } = null!;
    public Guid? ActorUserId { get; set; }
    public ApplicationUser? ActorUser { get; set; }
    public string ActorDisplayName { get; set; } = string.Empty;
    public string ChangeType { get; set; } = string.Empty;
    public string? PreviousValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

public enum RegistrationStatus
{
    Draft = 0,
    Submitted = 1,
    Confirmed = 2,
    Cancelled = 3
}

public enum AccommodationPreference
{
    Tent = 0,
    Cabin = 1,
    Either = 2
}
