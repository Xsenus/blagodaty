using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Account;

public sealed class AccountRegistrationSummaryDto
{
    public required Guid Id { get; init; }
    public Guid? EventEditionId { get; init; }
    public string? EventSlug { get; init; }
    public string? EventTitle { get; init; }
    public string? EventSeasonLabel { get; init; }
    public string? EventSeriesTitle { get; init; }
    public string? EventLocation { get; init; }
    public DateTime? EventStartsAtUtc { get; init; }
    public DateTime? EventEndsAtUtc { get; init; }
    public DateTime? RegistrationOpensAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public bool IsRegistrationOpen { get; init; }
    public bool IsRegistrationClosingSoon { get; init; }
    public int? RemainingCapacity { get; init; }
    public Guid? SelectedPriceOptionId { get; init; }
    public string? SelectedPriceOptionTitle { get; init; }
    public decimal? SelectedPriceOptionAmount { get; init; }
    public string? SelectedPriceOptionCurrency { get; init; }
    public required RegistrationStatus Status { get; init; }
    public required DateTime CreatedAtUtc { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
    public DateTime? SubmittedAtUtc { get; init; }
}
