using System.ComponentModel.DataAnnotations;
using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Camp;

public sealed class UpsertCampRegistrationRequest
{
    public Guid? SelectedPriceOptionId { get; set; }

    [Required, MaxLength(180)]
    public string FullName { get; set; } = string.Empty;

    [Required]
    public DateOnly BirthDate { get; set; }

    [Required, MaxLength(120)]
    public string City { get; set; } = string.Empty;

    [Required, MaxLength(180)]
    public string ChurchName { get; set; } = string.Empty;

    [Required, Phone, MaxLength(32)]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required, MaxLength(180)]
    public string EmergencyContactName { get; set; } = string.Empty;

    [Required, Phone, MaxLength(32)]
    public string EmergencyContactPhone { get; set; } = string.Empty;

    [Required]
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

    [Range(typeof(bool), "true", "true", ErrorMessage = "Consent must be accepted.")]
    public bool ConsentAccepted { get; set; }
}
