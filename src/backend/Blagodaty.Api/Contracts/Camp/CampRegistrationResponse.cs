using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Camp;

public sealed class CampRegistrationResponse
{
    public required Guid Id { get; init; }
    public Guid? EventEditionId { get; init; }
    public string? EventSlug { get; init; }
    public Guid? SelectedPriceOptionId { get; init; }
    public required RegistrationStatus Status { get; init; }
    public required string FullName { get; init; }
    public required DateOnly BirthDate { get; init; }
    public required string City { get; init; }
    public required string ChurchName { get; init; }
    public required string PhoneNumber { get; init; }
    public required string EmergencyContactName { get; init; }
    public required string EmergencyContactPhone { get; init; }
    public required AccommodationPreference AccommodationPreference { get; init; }
    public string? HealthNotes { get; init; }
    public string? AllergyNotes { get; init; }
    public string? SpecialNeeds { get; init; }
    public string? Motivation { get; init; }
    public required bool ConsentAccepted { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
    public DateTime? SubmittedAtUtc { get; init; }
}
