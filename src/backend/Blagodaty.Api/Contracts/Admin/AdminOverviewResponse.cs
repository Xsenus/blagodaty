using Blagodaty.Api.Models;
using Blagodaty.Api.Contracts.Account;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminOverviewResponse
{
    public required AdminStatsDto Stats { get; init; }
    public required IReadOnlyCollection<AdminRoleDto> Roles { get; init; }
}

public sealed class AdminStatsDto
{
    public required int TotalUsers { get; init; }
    public required int TotalRegistrations { get; init; }
    public required int SubmittedRegistrations { get; init; }
    public required int ConfirmedRegistrations { get; init; }
}

public sealed class AdminRoleDto
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Description { get; init; }
    public required int AssignedUserCount { get; init; }
    public required IReadOnlyCollection<string> MemberDisplayNames { get; init; }
}

public sealed class AdminUserDto
{
    public required Guid Id { get; init; }
    public Guid? RegistrationId { get; init; }
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? City { get; init; }
    public string? ChurchName { get; init; }
    public string? PhoneNumber { get; init; }
    public required IReadOnlyCollection<string> Roles { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? LastLoginAtUtc { get; init; }
    public Guid? RegistrationEventEditionId { get; init; }
    public string? RegistrationEventSlug { get; init; }
    public string? RegistrationEventTitle { get; init; }
    public RegistrationStatus? RegistrationStatus { get; init; }
    public string? RegistrationContactEmail { get; init; }
    public string? RegistrationFullName { get; init; }
    public DateOnly? RegistrationBirthDate { get; init; }
    public string? RegistrationPhoneNumber { get; init; }
    public bool? RegistrationPhoneNumberConfirmed { get; init; }
    public Guid? RegistrationSelectedPriceOptionId { get; init; }
    public string? RegistrationSelectedPriceOptionTitle { get; init; }
    public decimal? RegistrationSelectedPriceOptionAmount { get; init; }
    public string? RegistrationSelectedPriceOptionCurrency { get; init; }
    public int? RegistrationParticipantsCount { get; init; }
    public required IReadOnlyCollection<AdminRegistrationParticipantDto> RegistrationParticipants { get; init; }
    public bool? RegistrationHasCar { get; init; }
    public bool? RegistrationHasChildren { get; init; }
    public string? RegistrationEmergencyContactName { get; init; }
    public string? RegistrationEmergencyContactPhone { get; init; }
    public AccommodationPreference? RegistrationAccommodationPreference { get; init; }
    public string? RegistrationHealthNotes { get; init; }
    public string? RegistrationAllergyNotes { get; init; }
    public string? RegistrationSpecialNeeds { get; init; }
    public string? RegistrationMotivation { get; init; }
    public bool? RegistrationConsentAccepted { get; init; }
    public DateTime? RegistrationCreatedAtUtc { get; init; }
    public DateTime? RegistrationSubmittedAtUtc { get; init; }
    public DateTime? RegistrationUpdatedAtUtc { get; init; }
    public required IReadOnlyCollection<ExternalIdentityDto> ExternalIdentities { get; init; }
}

public sealed class AdminRegistrationParticipantDto
{
    public required string FullName { get; init; }
    public required bool IsChild { get; init; }
    public required int SortOrder { get; init; }
}
