namespace Blagodaty.Api.Models;

public sealed class EventSeries
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Slug { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public EventKind Kind { get; set; } = EventKind.Other;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<EventEdition> Editions { get; set; } = [];
}

public sealed class EventEdition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventSeriesId { get; set; }
    public EventSeries EventSeries { get; set; } = null!;

    public string Slug { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? SeasonLabel { get; set; }
    public string ShortDescription { get; set; } = string.Empty;
    public string? FullDescription { get; set; }
    public string? Location { get; set; }
    public string Timezone { get; set; } = "UTC";
    public EventEditionStatus Status { get; set; } = EventEditionStatus.Draft;
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public DateTime? RegistrationOpensAtUtc { get; set; }
    public DateTime? RegistrationClosesAtUtc { get; set; }
    public int? Capacity { get; set; }
    public bool WaitlistEnabled { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<EventPriceOption> PriceOptions { get; set; } = [];
    public ICollection<EventScheduleItem> ScheduleItems { get; set; } = [];
    public ICollection<EventContentBlock> ContentBlocks { get; set; } = [];
    public ICollection<EventMediaItem> MediaItems { get; set; } = [];
    public ICollection<CampRegistration> Registrations { get; set; } = [];
}

public sealed class EventPriceOption
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventEditionId { get; set; }
    public EventEdition EventEdition { get; set; } = null!;

    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "RUB";
    public DateTime? SalesStartsAtUtc { get; set; }
    public DateTime? SalesEndsAtUtc { get; set; }
    public int? Capacity { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<CampRegistration> Registrations { get; set; } = [];
}

public sealed class EventScheduleItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventEditionId { get; set; }
    public EventEdition EventEdition { get; set; } = null!;

    public string Title { get; set; } = string.Empty;
    public EventScheduleItemKind Kind { get; set; } = EventScheduleItemKind.Other;
    public DateTime StartsAtUtc { get; set; }
    public DateTime? EndsAtUtc { get; set; }
    public string? Location { get; set; }
    public string? Notes { get; set; }
    public int SortOrder { get; set; }
}

public sealed class EventContentBlock
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventEditionId { get; set; }
    public EventEdition EventEdition { get; set; } = null!;

    public EventContentBlockType BlockType { get; set; } = EventContentBlockType.About;
    public string? Title { get; set; }
    public string Body { get; set; } = string.Empty;
    public bool IsPublished { get; set; } = true;
    public int SortOrder { get; set; }
}

public sealed class EventMediaItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid EventEditionId { get; set; }
    public EventEdition EventEdition { get; set; } = null!;

    public EventMediaType Type { get; set; } = EventMediaType.Image;
    public string Url { get; set; } = string.Empty;
    public string? ThumbnailUrl { get; set; }
    public string? Title { get; set; }
    public string? Caption { get; set; }
    public bool IsPublished { get; set; } = true;
    public int SortOrder { get; set; }
}

public enum EventKind
{
    Camp = 0,
    Conference = 1,
    Retreat = 2,
    Trip = 3,
    Other = 10
}

public enum EventEditionStatus
{
    Draft = 0,
    Published = 1,
    RegistrationOpen = 2,
    RegistrationClosed = 3,
    InProgress = 4,
    Completed = 5,
    Archived = 6
}

public enum EventScheduleItemKind
{
    Arrival = 0,
    MainProgram = 1,
    Departure = 2,
    Meeting = 3,
    Deadline = 4,
    Other = 10
}

public enum EventContentBlockType
{
    Hero = 0,
    About = 1,
    Highlight = 2,
    WhatToBring = 3,
    Program = 4,
    ImportantNotice = 5,
    Faq = 6
}

public enum EventMediaType
{
    Image = 0,
    Video = 1
}
