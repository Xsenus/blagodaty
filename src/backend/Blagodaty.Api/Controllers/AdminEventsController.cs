using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/events")]
public sealed class AdminEventsController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public AdminEventsController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<AdminEventsResponse>> GetEvents()
    {
        var editions = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(edition => edition.EventSeries)
            .Include(edition => edition.MediaItems)
            .OrderByDescending(edition => edition.StartsAtUtc)
            .ThenBy(edition => edition.SortOrder)
            .ToListAsync();

        var registrationStats = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration => registration.EventEditionId != null)
            .GroupBy(registration => registration.EventEditionId!.Value)
            .Select(group => new
            {
                EventEditionId = group.Key,
                RegistrationsCount = group.Count(),
                SubmittedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Submitted),
                ConfirmedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Confirmed)
            })
            .ToListAsync();

        var statsByEditionId = registrationStats.ToDictionary(item => item.EventEditionId);

        return Ok(new AdminEventsResponse
        {
            Events = editions.Select(edition =>
            {
                statsByEditionId.TryGetValue(edition.Id, out var stats);

                return new AdminEventSummaryDto
                {
                    Id = edition.Id,
                    EventSeriesId = edition.EventSeriesId,
                    SeriesSlug = edition.EventSeries.Slug,
                    SeriesTitle = edition.EventSeries.Title,
                    Kind = edition.EventSeries.Kind,
                    Slug = edition.Slug,
                    Title = edition.Title,
                    SeasonLabel = edition.SeasonLabel,
                    Status = edition.Status,
                    StartsAtUtc = edition.StartsAtUtc,
                    EndsAtUtc = edition.EndsAtUtc,
                    RegistrationClosesAtUtc = edition.RegistrationClosesAtUtc,
                    Capacity = edition.Capacity,
                    RegistrationsCount = stats?.RegistrationsCount ?? 0,
                    SubmittedRegistrations = stats?.SubmittedRegistrations ?? 0,
                    ConfirmedRegistrations = stats?.ConfirmedRegistrations ?? 0,
                    RemainingCapacity = edition.Capacity is null
                        ? null
                        : Math.Max(edition.Capacity.Value - (stats?.SubmittedRegistrations ?? 0) - (stats?.ConfirmedRegistrations ?? 0), 0),
                    PrimaryImageUrl = SelectPrimaryImageUrl(edition.MediaItems)
                };
            }).ToArray()
        });
    }

    [HttpGet("{eventId:guid}")]
    public async Task<ActionResult<AdminEventDetailsResponse>> GetEvent([FromRoute] Guid eventId)
    {
        var edition = await FindEditionAsync(eventId);
        return edition is null ? NotFound() : Ok(MapEdition(edition));
    }

    [HttpPost]
    public async Task<ActionResult<AdminEventDetailsResponse>> CreateEvent([FromBody] UpsertAdminEventRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var created = await SaveEditionAsync(null, request);
            return CreatedAtAction(nameof(GetEvent), new { eventId = created.Id }, MapEdition(created));
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpPut("{eventId:guid}")]
    public async Task<ActionResult<AdminEventDetailsResponse>> UpdateEvent([FromRoute] Guid eventId, [FromBody] UpsertAdminEventRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            var updated = await SaveEditionAsync(eventId, request);
            return Ok(MapEdition(updated));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    private async Task<EventEdition?> FindEditionAsync(Guid eventId)
    {
        return await _dbContext.EventEditions
            .AsNoTracking()
            .Include(edition => edition.EventSeries)
            .Include(edition => edition.PriceOptions)
            .Include(edition => edition.ScheduleItems)
            .Include(edition => edition.ContentBlocks)
            .Include(edition => edition.MediaItems)
            .FirstOrDefaultAsync(edition => edition.Id == eventId);
    }

    private async Task<EventEdition> SaveEditionAsync(Guid? eventId, UpsertAdminEventRequest request)
    {
        ValidateEventRequest(request);

        var normalizedSeriesSlug = NormalizeSlug(request.SeriesSlug);
        var normalizedEditionSlug = NormalizeSlug(request.Slug);
        var now = DateTime.UtcNow;

        EventEdition edition;
        EventSeries series;

        if (eventId is null)
        {
            var duplicateEdition = await _dbContext.EventEditions.AnyAsync(item => item.Slug == normalizedEditionSlug);
            if (duplicateEdition)
            {
                throw new InvalidOperationException("Мероприятие с таким slug уже существует.");
            }

            series = await _dbContext.EventSeries.FirstOrDefaultAsync(item => item.Slug == normalizedSeriesSlug)
                ?? new EventSeries
                {
                    Id = Guid.NewGuid(),
                    Slug = normalizedSeriesSlug,
                    CreatedAtUtc = now
                };

            if (_dbContext.Entry(series).State == EntityState.Detached)
            {
                _dbContext.EventSeries.Add(series);
            }

            edition = new EventEdition
            {
                Id = Guid.NewGuid(),
                CreatedAtUtc = now
            };

            _dbContext.EventEditions.Add(edition);
        }
        else
        {
            edition = await _dbContext.EventEditions
                .Include(item => item.EventSeries)
                .Include(item => item.PriceOptions)
                .Include(item => item.ScheduleItems)
                .Include(item => item.ContentBlocks)
                .Include(item => item.MediaItems)
                .FirstOrDefaultAsync(item => item.Id == eventId.Value)
                ?? throw new KeyNotFoundException();

            var duplicateEdition = await _dbContext.EventEditions.AnyAsync(item => item.Id != eventId.Value && item.Slug == normalizedEditionSlug);
            if (duplicateEdition)
            {
                throw new InvalidOperationException("Другое мероприятие уже использует этот slug.");
            }

            series = edition.EventSeries;
        }

        series.Slug = normalizedSeriesSlug;
        series.Title = request.SeriesTitle.Trim();
        series.Kind = request.Kind;
        series.IsActive = request.SeriesIsActive;
        series.UpdatedAtUtc = now;

        edition.EventSeries = series;
        edition.Slug = normalizedEditionSlug;
        edition.Title = request.Title.Trim();
        edition.SeasonLabel = request.SeasonLabel?.Trim();
        edition.ShortDescription = request.ShortDescription.Trim();
        edition.FullDescription = request.FullDescription?.Trim();
        edition.Location = request.Location?.Trim();
        edition.Timezone = request.Timezone.Trim();
        edition.Status = request.Status;
        edition.StartsAtUtc = request.StartsAtUtc;
        edition.EndsAtUtc = request.EndsAtUtc;
        edition.RegistrationOpensAtUtc = request.RegistrationOpensAtUtc;
        edition.RegistrationClosesAtUtc = request.RegistrationClosesAtUtc;
        edition.Capacity = request.Capacity;
        edition.WaitlistEnabled = request.WaitlistEnabled;
        edition.SortOrder = request.SortOrder;
        edition.UpdatedAtUtc = now;

        if (eventId is not null)
        {
            _dbContext.EventPriceOptions.RemoveRange(edition.PriceOptions);
            _dbContext.EventScheduleItems.RemoveRange(edition.ScheduleItems);
            _dbContext.EventContentBlocks.RemoveRange(edition.ContentBlocks);
            _dbContext.EventMediaItems.RemoveRange(edition.MediaItems);
            edition.PriceOptions.Clear();
            edition.ScheduleItems.Clear();
            edition.ContentBlocks.Clear();
            edition.MediaItems.Clear();
        }

        foreach (var option in request.PriceOptions.OrderBy(item => item.SortOrder).ThenBy(item => item.Title, StringComparer.OrdinalIgnoreCase))
        {
            edition.PriceOptions.Add(new EventPriceOption
            {
                Id = Guid.NewGuid(),
                Code = NormalizeSlug(option.Code),
                Title = option.Title.Trim(),
                Description = option.Description?.Trim(),
                Amount = option.Amount,
                Currency = option.Currency.Trim().ToUpperInvariant(),
                SalesStartsAtUtc = option.SalesStartsAtUtc,
                SalesEndsAtUtc = option.SalesEndsAtUtc,
                Capacity = option.Capacity,
                IsDefault = option.IsDefault,
                IsActive = option.IsActive,
                SortOrder = option.SortOrder,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        foreach (var item in request.ScheduleItems.OrderBy(item => item.SortOrder).ThenBy(item => item.StartsAtUtc))
        {
            edition.ScheduleItems.Add(new EventScheduleItem
            {
                Id = Guid.NewGuid(),
                Title = item.Title.Trim(),
                Kind = item.Kind,
                StartsAtUtc = item.StartsAtUtc,
                EndsAtUtc = item.EndsAtUtc,
                Location = item.Location?.Trim(),
                Notes = item.Notes?.Trim(),
                SortOrder = item.SortOrder
            });
        }

        foreach (var block in request.ContentBlocks.OrderBy(item => item.SortOrder).ThenBy(item => item.BlockType))
        {
            edition.ContentBlocks.Add(new EventContentBlock
            {
                Id = Guid.NewGuid(),
                BlockType = block.BlockType,
                Title = block.Title?.Trim(),
                Body = block.Body.Trim(),
                IsPublished = block.IsPublished,
                SortOrder = block.SortOrder
            });
        }

        foreach (var mediaItem in request.MediaItems.OrderBy(item => item.SortOrder).ThenBy(item => item.Type))
        {
            edition.MediaItems.Add(new EventMediaItem
            {
                Id = Guid.NewGuid(),
                Type = mediaItem.Type,
                Url = mediaItem.Url.Trim(),
                ThumbnailUrl = mediaItem.ThumbnailUrl?.Trim(),
                Title = mediaItem.Title?.Trim(),
                Caption = mediaItem.Caption?.Trim(),
                IsPublished = mediaItem.IsPublished,
                SortOrder = mediaItem.SortOrder
            });
        }

        await _dbContext.SaveChangesAsync();

        return await FindEditionAsync(edition.Id) ?? throw new InvalidOperationException("Не удалось перечитать сохранённое мероприятие.");
    }

    private static void ValidateEventRequest(UpsertAdminEventRequest request)
    {
        if (request.StartsAtUtc >= request.EndsAtUtc)
        {
            throw new InvalidOperationException("Дата начала должна быть раньше даты завершения.");
        }

        if (request.RegistrationOpensAtUtc.HasValue &&
            request.RegistrationClosesAtUtc.HasValue &&
            request.RegistrationOpensAtUtc.Value > request.RegistrationClosesAtUtc.Value)
        {
            throw new InvalidOperationException("Открытие регистрации не может быть позже закрытия.");
        }

        if (request.PriceOptions.GroupBy(item => NormalizeSlug(item.Code), StringComparer.OrdinalIgnoreCase).Any(group => group.Count() > 1))
        {
            throw new InvalidOperationException("Коды тарифов должны быть уникальны внутри мероприятия.");
        }

        if (request.MediaItems.Any(item => string.IsNullOrWhiteSpace(item.Url)))
        {
            throw new InvalidOperationException("У каждого медиа-элемента события должен быть заполнен URL.");
        }
    }

    private static string NormalizeSlug(string value)
    {
        return value.Trim().ToLowerInvariant();
    }

    private static AdminEventDetailsResponse MapEdition(EventEdition edition)
    {
        return new AdminEventDetailsResponse
        {
            Id = edition.Id,
            EventSeriesId = edition.EventSeriesId,
            SeriesSlug = edition.EventSeries.Slug,
            SeriesTitle = edition.EventSeries.Title,
            Kind = edition.EventSeries.Kind,
            SeriesIsActive = edition.EventSeries.IsActive,
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
            Capacity = edition.Capacity,
            WaitlistEnabled = edition.WaitlistEnabled,
            SortOrder = edition.SortOrder,
            PriceOptions = edition.PriceOptions
                .OrderBy(option => option.SortOrder)
                .ThenBy(option => option.Title)
                .Select(option => new AdminEventPriceOptionDto
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
                    IsActive = option.IsActive,
                    SortOrder = option.SortOrder
                })
                .ToArray(),
            ScheduleItems = edition.ScheduleItems
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.StartsAtUtc)
                .Select(item => new AdminEventScheduleItemDto
                {
                    Id = item.Id,
                    Title = item.Title,
                    Kind = item.Kind,
                    StartsAtUtc = item.StartsAtUtc,
                    EndsAtUtc = item.EndsAtUtc,
                    Location = item.Location,
                    Notes = item.Notes,
                    SortOrder = item.SortOrder
                })
                .ToArray(),
            ContentBlocks = edition.ContentBlocks
                .OrderBy(block => block.SortOrder)
                .ThenBy(block => block.BlockType)
                .Select(block => new AdminEventContentBlockDto
                {
                    Id = block.Id,
                    BlockType = block.BlockType,
                    Title = block.Title,
                    Body = block.Body,
                    IsPublished = block.IsPublished,
                    SortOrder = block.SortOrder
                })
                .ToArray(),
            MediaItems = edition.MediaItems
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Type)
                .Select(item => new AdminEventMediaItemDto
                {
                    Id = item.Id,
                    Type = item.Type,
                    Url = item.Url,
                    ThumbnailUrl = item.ThumbnailUrl,
                    Title = item.Title,
                    Caption = item.Caption,
                    IsPublished = item.IsPublished,
                    SortOrder = item.SortOrder
                })
                .ToArray()
        };
    }

    private static string? SelectPrimaryImageUrl(IEnumerable<EventMediaItem> mediaItems)
    {
        return mediaItems
            .Where(item => item.IsPublished)
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Type)
            .Select(item => item.Type == EventMediaType.Image ? item.Url : item.ThumbnailUrl)
            .FirstOrDefault(url => !string.IsNullOrWhiteSpace(url));
    }
}
