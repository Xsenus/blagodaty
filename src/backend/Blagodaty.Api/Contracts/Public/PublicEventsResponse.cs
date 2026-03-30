using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Public;

public sealed class PublicEventsResponse
{
    public required IReadOnlyCollection<PublicEventSummaryDto> Events { get; init; }
}

public sealed class PublicEventSummaryDto
{
    public required Guid Id { get; init; }
    public required string SeriesSlug { get; init; }
    public required string SeriesTitle { get; init; }
    public required EventKind Kind { get; init; }
    public required string Slug { get; init; }
    public required string Title { get; init; }
    public string? SeasonLabel { get; init; }
    public required string ShortDescription { get; init; }
    public string? Location { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public required DateTime EndsAtUtc { get; init; }
    public DateTime? RegistrationOpensAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public required bool IsRegistrationOpen { get; init; }
    public required bool IsRegistrationClosingSoon { get; init; }
    public int? Capacity { get; init; }
    public int? RemainingCapacity { get; init; }
    public required bool WaitlistEnabled { get; init; }
    public decimal? PriceFromAmount { get; init; }
    public string? PriceCurrency { get; init; }
}

public sealed class PublicEventDetailsResponse
{
    public required Guid Id { get; init; }
    public required string SeriesSlug { get; init; }
    public required string SeriesTitle { get; init; }
    public required EventKind Kind { get; init; }
    public required string Slug { get; init; }
    public required string Title { get; init; }
    public string? SeasonLabel { get; init; }
    public required string ShortDescription { get; init; }
    public string? FullDescription { get; init; }
    public string? Location { get; init; }
    public required string Timezone { get; init; }
    public required EventEditionStatus Status { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public required DateTime EndsAtUtc { get; init; }
    public DateTime? RegistrationOpensAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public required bool IsRegistrationOpen { get; init; }
    public required bool IsRegistrationClosingSoon { get; init; }
    public int? Capacity { get; init; }
    public int? RemainingCapacity { get; init; }
    public required bool WaitlistEnabled { get; init; }
    public required IReadOnlyCollection<PublicEventPriceOptionDto> PriceOptions { get; init; }
    public required IReadOnlyCollection<PublicEventScheduleItemDto> ScheduleItems { get; init; }
    public required IReadOnlyCollection<PublicEventContentBlockDto> ContentBlocks { get; init; }
}

public sealed class PublicEventPriceOptionDto
{
    public required Guid Id { get; init; }
    public required string Code { get; init; }
    public required string Title { get; init; }
    public string? Description { get; init; }
    public required decimal Amount { get; init; }
    public required string Currency { get; init; }
    public DateTime? SalesStartsAtUtc { get; init; }
    public DateTime? SalesEndsAtUtc { get; init; }
    public int? Capacity { get; init; }
    public required bool IsDefault { get; init; }
    public required bool IsActive { get; init; }
}

public sealed class PublicEventScheduleItemDto
{
    public required Guid Id { get; init; }
    public required string Title { get; init; }
    public required EventScheduleItemKind Kind { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public DateTime? EndsAtUtc { get; init; }
    public string? Location { get; init; }
    public string? Notes { get; init; }
}

public sealed class PublicEventContentBlockDto
{
    public required Guid Id { get; init; }
    public required EventContentBlockType BlockType { get; init; }
    public string? Title { get; init; }
    public required string Body { get; init; }
}
