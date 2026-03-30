using System.ComponentModel.DataAnnotations;
using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminEventsResponse
{
    public required IReadOnlyCollection<AdminEventSummaryDto> Events { get; init; }
}

public sealed class AdminEventSummaryDto
{
    public required Guid Id { get; init; }
    public required Guid EventSeriesId { get; init; }
    public required string SeriesSlug { get; init; }
    public required string SeriesTitle { get; init; }
    public required EventKind Kind { get; init; }
    public required string Slug { get; init; }
    public required string Title { get; init; }
    public string? SeasonLabel { get; init; }
    public required EventEditionStatus Status { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public required DateTime EndsAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public int? Capacity { get; init; }
    public int RegistrationsCount { get; init; }
    public int SubmittedRegistrations { get; init; }
    public int ConfirmedRegistrations { get; init; }
    public int? RemainingCapacity { get; init; }
}

public sealed class AdminEventDetailsResponse
{
    public required Guid Id { get; init; }
    public required Guid EventSeriesId { get; init; }
    public required string SeriesSlug { get; init; }
    public required string SeriesTitle { get; init; }
    public required EventKind Kind { get; init; }
    public required bool SeriesIsActive { get; init; }
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
    public int? Capacity { get; init; }
    public required bool WaitlistEnabled { get; init; }
    public required int SortOrder { get; init; }
    public required IReadOnlyCollection<AdminEventPriceOptionDto> PriceOptions { get; init; }
    public required IReadOnlyCollection<AdminEventScheduleItemDto> ScheduleItems { get; init; }
    public required IReadOnlyCollection<AdminEventContentBlockDto> ContentBlocks { get; init; }
}

public sealed class AdminEventPriceOptionDto
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
    public required int SortOrder { get; init; }
}

public sealed class AdminEventScheduleItemDto
{
    public required Guid Id { get; init; }
    public required string Title { get; init; }
    public required EventScheduleItemKind Kind { get; init; }
    public required DateTime StartsAtUtc { get; init; }
    public DateTime? EndsAtUtc { get; init; }
    public string? Location { get; init; }
    public string? Notes { get; init; }
    public required int SortOrder { get; init; }
}

public sealed class AdminEventContentBlockDto
{
    public required Guid Id { get; init; }
    public required EventContentBlockType BlockType { get; init; }
    public string? Title { get; init; }
    public required string Body { get; init; }
    public required bool IsPublished { get; init; }
    public required int SortOrder { get; init; }
}

public sealed class UpsertAdminEventRequest
{
    [Required, MaxLength(120)]
    public string SeriesSlug { get; init; } = string.Empty;

    [Required, MaxLength(180)]
    public string SeriesTitle { get; init; } = string.Empty;

    public EventKind Kind { get; init; } = EventKind.Camp;
    public bool SeriesIsActive { get; init; } = true;

    [Required, MaxLength(140)]
    public string Slug { get; init; } = string.Empty;

    [Required, MaxLength(220)]
    public string Title { get; init; } = string.Empty;

    [MaxLength(80)]
    public string? SeasonLabel { get; init; }

    [Required, MaxLength(600)]
    public string ShortDescription { get; init; } = string.Empty;

    [MaxLength(8000)]
    public string? FullDescription { get; init; }

    [MaxLength(220)]
    public string? Location { get; init; }

    [Required, MaxLength(64)]
    public string Timezone { get; init; } = "UTC";

    public EventEditionStatus Status { get; init; } = EventEditionStatus.Draft;
    public DateTime StartsAtUtc { get; init; }
    public DateTime EndsAtUtc { get; init; }
    public DateTime? RegistrationOpensAtUtc { get; init; }
    public DateTime? RegistrationClosesAtUtc { get; init; }
    public int? Capacity { get; init; }
    public bool WaitlistEnabled { get; init; }
    public int SortOrder { get; init; }
    public IReadOnlyCollection<UpsertAdminEventPriceOptionRequest> PriceOptions { get; init; } = Array.Empty<UpsertAdminEventPriceOptionRequest>();
    public IReadOnlyCollection<UpsertAdminEventScheduleItemRequest> ScheduleItems { get; init; } = Array.Empty<UpsertAdminEventScheduleItemRequest>();
    public IReadOnlyCollection<UpsertAdminEventContentBlockRequest> ContentBlocks { get; init; } = Array.Empty<UpsertAdminEventContentBlockRequest>();
}

public sealed class UpsertAdminEventPriceOptionRequest
{
    [Required, MaxLength(64)]
    public string Code { get; init; } = string.Empty;

    [Required, MaxLength(180)]
    public string Title { get; init; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; init; }

    public decimal Amount { get; init; }

    [Required, MaxLength(8)]
    public string Currency { get; init; } = "RUB";

    public DateTime? SalesStartsAtUtc { get; init; }
    public DateTime? SalesEndsAtUtc { get; init; }
    public int? Capacity { get; init; }
    public bool IsDefault { get; init; }
    public bool IsActive { get; init; } = true;
    public int SortOrder { get; init; }
}

public sealed class UpsertAdminEventScheduleItemRequest
{
    [Required, MaxLength(180)]
    public string Title { get; init; } = string.Empty;

    public EventScheduleItemKind Kind { get; init; } = EventScheduleItemKind.Other;
    public DateTime StartsAtUtc { get; init; }
    public DateTime? EndsAtUtc { get; init; }

    [MaxLength(220)]
    public string? Location { get; init; }

    [MaxLength(2000)]
    public string? Notes { get; init; }

    public int SortOrder { get; init; }
}

public sealed class UpsertAdminEventContentBlockRequest
{
    public EventContentBlockType BlockType { get; init; } = EventContentBlockType.About;

    [MaxLength(180)]
    public string? Title { get; init; }

    [Required, MaxLength(8000)]
    public string Body { get; init; } = string.Empty;

    public bool IsPublished { get; init; } = true;
    public int SortOrder { get; init; }
}
