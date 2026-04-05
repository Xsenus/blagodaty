using System.ComponentModel.DataAnnotations;
using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Camp;

public sealed class UpsertCampRegistrationRequest
{
    public Guid? SelectedPriceOptionId { get; set; }

    [MaxLength(180)]
    public string FullName { get; set; } = string.Empty;

    [MaxLength(320)]
    public string ContactEmail { get; set; } = string.Empty;

    public string? BirthDate { get; set; }

    [MaxLength(120)]
    public string City { get; set; } = string.Empty;

    [MaxLength(180)]
    public string ChurchName { get; set; } = string.Empty;

    [MaxLength(32)]
    public string PhoneNumber { get; set; } = string.Empty;

    public bool HasCar { get; set; }
    public bool HasChildren { get; set; }

    public IReadOnlyCollection<UpsertCampRegistrationParticipantRequest> Participants { get; set; } =
        Array.Empty<UpsertCampRegistrationParticipantRequest>();

    [MaxLength(180)]
    public string EmergencyContactName { get; set; } = string.Empty;

    [MaxLength(32)]
    public string EmergencyContactPhone { get; set; } = string.Empty;

    public AccommodationPreference AccommodationPreference { get; set; } = AccommodationPreference.Either;

    [MaxLength(2000)]
    public string? HealthNotes { get; set; }

    [MaxLength(2000)]
    public string? AllergyNotes { get; set; }

    [MaxLength(2000)]
    public string? SpecialNeeds { get; set; }

    [MaxLength(2000)]
    public string? Motivation { get; set; }

    public bool Submit { get; set; }

    public bool ConsentAccepted { get; set; }
}

public sealed class UpsertCampRegistrationParticipantRequest
{
    [MaxLength(180)]
    public string FullName { get; set; } = string.Empty;

    public bool IsChild { get; set; }
}
