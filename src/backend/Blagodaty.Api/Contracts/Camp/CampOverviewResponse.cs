namespace Blagodaty.Api.Contracts.Camp;

public sealed class CampOverviewResponse
{
    public string? EventSlug { get; init; }
    public required string Name { get; init; }
    public required string Season { get; init; }
    public required string Tagline { get; init; }
    public required string Location { get; init; }
    public required decimal SuggestedDonation { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public required DateTime EndsAtUtc { get; init; }
    public DateTime? RegistrationOpensAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public bool IsRegistrationOpen { get; init; }
    public bool IsRegistrationClosingSoon { get; init; }
    public int? Capacity { get; init; }
    public int? RemainingCapacity { get; init; }
    public required IReadOnlyList<string> Highlights { get; init; }
    public required IReadOnlyList<string> ThingsToBring { get; init; }
}
