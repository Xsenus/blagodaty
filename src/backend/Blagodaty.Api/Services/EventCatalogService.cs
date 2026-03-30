using Blagodaty.Api.Contracts.Public;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed class EventCatalogService
{
    private readonly AppDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public EventCatalogService(AppDbContext dbContext, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
    }

    public async Task<EventEdition?> GetActiveCampEditionAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.EventEditions
            .AsNoTracking()
            .Include(edition => edition.EventSeries)
            .Include(edition => edition.PriceOptions)
            .Include(edition => edition.ContentBlocks)
            .Where(edition =>
                edition.EventSeries.IsActive &&
                edition.EventSeries.Kind == EventKind.Camp &&
                edition.Status != EventEditionStatus.Draft &&
                edition.Status != EventEditionStatus.Archived)
            .OrderBy(edition => edition.Status == EventEditionStatus.RegistrationOpen ? 0 :
                edition.Status == EventEditionStatus.Published ? 1 :
                edition.Status == EventEditionStatus.RegistrationClosed ? 2 :
                edition.Status == EventEditionStatus.InProgress ? 3 :
                edition.Status == EventEditionStatus.Completed ? 4 : 10)
            .ThenByDescending(edition => edition.StartsAtUtc)
            .ThenBy(edition => edition.SortOrder)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<Guid?> GetActiveCampEditionIdAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.EventEditions
            .AsNoTracking()
            .Where(edition =>
                edition.EventSeries.IsActive &&
                edition.EventSeries.Kind == EventKind.Camp &&
                edition.Status != EventEditionStatus.Draft &&
                edition.Status != EventEditionStatus.Archived)
            .OrderBy(edition => edition.Status == EventEditionStatus.RegistrationOpen ? 0 :
                edition.Status == EventEditionStatus.Published ? 1 :
                edition.Status == EventEditionStatus.RegistrationClosed ? 2 :
                edition.Status == EventEditionStatus.InProgress ? 3 :
                edition.Status == EventEditionStatus.Completed ? 4 : 10)
            .ThenByDescending(edition => edition.StartsAtUtc)
            .ThenBy(edition => edition.SortOrder)
            .Select(edition => (Guid?)edition.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<PublicEventSummaryDto>> GetPublicEventsAsync(CancellationToken cancellationToken = default)
    {
        var editions = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(edition => edition.EventSeries)
            .Include(edition => edition.PriceOptions)
            .Where(edition =>
                edition.EventSeries.IsActive &&
                (edition.Status == EventEditionStatus.Published ||
                 edition.Status == EventEditionStatus.RegistrationOpen ||
                 edition.Status == EventEditionStatus.RegistrationClosed ||
                 edition.Status == EventEditionStatus.InProgress ||
                 edition.Status == EventEditionStatus.Completed))
            .OrderBy(edition => edition.StartsAtUtc)
            .ThenBy(edition => edition.SortOrder)
            .ToListAsync(cancellationToken);

        var occupancy = await GetOccupiedSlotsByEditionIdAsync(editions.Select(edition => edition.Id), cancellationToken);

        return editions
            .Select(edition => MapSummary(edition, occupancy.GetValueOrDefault(edition.Id)))
            .ToArray();
    }

    public async Task<PublicEventDetailsResponse?> GetPublicEventBySlugAsync(string slug, CancellationToken cancellationToken = default)
    {
        var edition = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .Include(item => item.PriceOptions)
            .Include(item => item.ScheduleItems)
            .Include(item => item.ContentBlocks)
            .FirstOrDefaultAsync(item =>
                item.Slug == slug &&
                item.EventSeries.IsActive &&
                (item.Status == EventEditionStatus.Published ||
                 item.Status == EventEditionStatus.RegistrationOpen ||
                 item.Status == EventEditionStatus.RegistrationClosed ||
                 item.Status == EventEditionStatus.InProgress ||
                 item.Status == EventEditionStatus.Completed), cancellationToken);

        if (edition is null)
        {
            return null;
        }

        var occupied = (await GetOccupiedSlotsByEditionIdAsync([edition.Id], cancellationToken)).GetValueOrDefault(edition.Id);
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var remainingCapacity = GetRemainingCapacity(edition, occupied);

        return new PublicEventDetailsResponse
        {
            Id = edition.Id,
            SeriesSlug = edition.EventSeries.Slug,
            SeriesTitle = edition.EventSeries.Title,
            Kind = edition.EventSeries.Kind,
            Slug = edition.Slug,
            Title = edition.Title,
            SeasonLabel = edition.SeasonLabel,
            ShortDescription = edition.ShortDescription,
            FullDescription = edition.FullDescription,
            Location = edition.Location,
            Timezone = edition.Timezone,
            Status = edition.Status,
            StartsAtUtc = edition.StartsAtUtc,
            EndsAtUtc = edition.EndsAtUtc,
            RegistrationOpensAtUtc = edition.RegistrationOpensAtUtc,
            RegistrationClosesAtUtc = edition.RegistrationClosesAtUtc,
            IsRegistrationOpen = IsRegistrationOpen(edition, remainingCapacity, now),
            IsRegistrationClosingSoon = IsRegistrationClosingSoon(edition, remainingCapacity, now),
            Capacity = edition.Capacity,
            RemainingCapacity = remainingCapacity,
            WaitlistEnabled = edition.WaitlistEnabled,
            PriceOptions = edition.PriceOptions
                .OrderBy(option => option.SortOrder)
                .ThenBy(option => option.Title)
                .Select(option => new PublicEventPriceOptionDto
                {
                    Id = option.Id,
                    Code = option.Code,
                    Title = option.Title,
                    Description = option.Description,
                    Amount = option.Amount,
                    Currency = option.Currency,
                    SalesStartsAtUtc = option.SalesStartsAtUtc,
                    SalesEndsAtUtc = option.SalesEndsAtUtc,
                    Capacity = option.Capacity,
                    IsDefault = option.IsDefault,
                    IsActive = option.IsActive
                })
                .ToArray(),
            ScheduleItems = edition.ScheduleItems
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.StartsAtUtc)
                .Select(item => new PublicEventScheduleItemDto
                {
                    Id = item.Id,
                    Title = item.Title,
                    Kind = item.Kind,
                    StartsAtUtc = item.StartsAtUtc,
                    EndsAtUtc = item.EndsAtUtc,
                    Location = item.Location,
                    Notes = item.Notes
                })
                .ToArray(),
            ContentBlocks = edition.ContentBlocks
                .Where(block => block.IsPublished)
                .OrderBy(block => block.SortOrder)
                .ThenBy(block => block.BlockType)
                .Select(block => new PublicEventContentBlockDto
                {
                    Id = block.Id,
                    BlockType = block.BlockType,
                    Title = block.Title,
                    Body = block.Body
                })
                .ToArray()
        };
    }

    public async Task<int?> GetRemainingCapacityAsync(Guid? eventEditionId, CancellationToken cancellationToken = default)
    {
        if (eventEditionId is null)
        {
            return null;
        }

        var edition = await _dbContext.EventEditions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Id == eventEditionId.Value, cancellationToken);

        if (edition is null)
        {
            return null;
        }

        var occupied = (await GetOccupiedSlotsByEditionIdAsync([edition.Id], cancellationToken)).GetValueOrDefault(edition.Id);
        return GetRemainingCapacity(edition, occupied);
    }

    private async Task<Dictionary<Guid, int>> GetOccupiedSlotsByEditionIdAsync(IEnumerable<Guid> eventEditionIds, CancellationToken cancellationToken)
    {
        var ids = eventEditionIds.Distinct().ToArray();
        if (ids.Length == 0)
        {
            return [];
        }

        var rows = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration =>
                registration.EventEditionId != null &&
                ids.Contains(registration.EventEditionId.Value) &&
                registration.Status != RegistrationStatus.Draft &&
                registration.Status != RegistrationStatus.Cancelled)
            .GroupBy(registration => registration.EventEditionId!.Value)
            .Select(group => new
            {
                EventEditionId = group.Key,
                Count = group.Count()
            })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(row => row.EventEditionId, row => row.Count);
    }

    private PublicEventSummaryDto MapSummary(EventEdition edition, int occupiedSlots)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var remainingCapacity = GetRemainingCapacity(edition, occupiedSlots);
        var activePrice = edition.PriceOptions
            .Where(option => option.IsActive && IsPriceAvailable(option, now))
            .OrderBy(option => option.Amount)
            .ThenBy(option => option.SortOrder)
            .FirstOrDefault();

        return new PublicEventSummaryDto
        {
            Id = edition.Id,
            SeriesSlug = edition.EventSeries.Slug,
            SeriesTitle = edition.EventSeries.Title,
            Kind = edition.EventSeries.Kind,
            Slug = edition.Slug,
            Title = edition.Title,
            SeasonLabel = edition.SeasonLabel,
            ShortDescription = edition.ShortDescription,
            Location = edition.Location,
            StartsAtUtc = edition.StartsAtUtc,
            EndsAtUtc = edition.EndsAtUtc,
            RegistrationOpensAtUtc = edition.RegistrationOpensAtUtc,
            RegistrationClosesAtUtc = edition.RegistrationClosesAtUtc,
            IsRegistrationOpen = IsRegistrationOpen(edition, remainingCapacity, now),
            IsRegistrationClosingSoon = IsRegistrationClosingSoon(edition, remainingCapacity, now),
            Capacity = edition.Capacity,
            RemainingCapacity = remainingCapacity,
            WaitlistEnabled = edition.WaitlistEnabled,
            PriceFromAmount = activePrice?.Amount,
            PriceCurrency = activePrice?.Currency
        };
    }

    private static int? GetRemainingCapacity(EventEdition edition, int occupiedSlots)
    {
        if (edition.Capacity is null)
        {
            return null;
        }

        return Math.Max(edition.Capacity.Value - occupiedSlots, 0);
    }

    private static bool IsPriceAvailable(EventPriceOption option, DateTime now)
    {
        return (!option.SalesStartsAtUtc.HasValue || option.SalesStartsAtUtc.Value <= now) &&
               (!option.SalesEndsAtUtc.HasValue || option.SalesEndsAtUtc.Value >= now);
    }

    private static bool IsRegistrationOpen(EventEdition edition, int? remainingCapacity, DateTime now)
    {
        if (edition.Status != EventEditionStatus.RegistrationOpen)
        {
            return false;
        }

        if (edition.RegistrationOpensAtUtc.HasValue && edition.RegistrationOpensAtUtc.Value > now)
        {
            return false;
        }

        if (edition.RegistrationClosesAtUtc.HasValue && edition.RegistrationClosesAtUtc.Value < now)
        {
            return false;
        }

        return remainingCapacity is null || remainingCapacity > 0 || edition.WaitlistEnabled;
    }

    private static bool IsRegistrationClosingSoon(EventEdition edition, int? remainingCapacity, DateTime now)
    {
        return IsRegistrationOpen(edition, remainingCapacity, now) &&
               edition.RegistrationClosesAtUtc.HasValue &&
               edition.RegistrationClosesAtUtc.Value <= now.AddDays(5);
    }
}
