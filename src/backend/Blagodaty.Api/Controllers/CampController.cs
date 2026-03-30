using System.Security.Claims;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Route("api/camp")]
public sealed class CampController : ControllerBase
{
    private static readonly string[] FallbackHighlights =
    [
        "Походы и выезды в горы Алтая вместе с церковной командой.",
        "Палатки, домики, костры и теплые вечерние встречи под открытым небом.",
        "Поклонение, молитва, наставничество и живое братское общение."
    ];

    private static readonly string[] FallbackThingsToBring =
    [
        "Спальник, коврик, фонарик и базовую походную одежду.",
        "Средства личной гигиены, теплые вещи и дождевик на случай перемены погоды.",
        "Библию, блокнот, ручку и открытое сердце к Богу и людям."
    ];

    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CampOptions _campOptions;
    private readonly EventCatalogService _eventCatalogService;
    private readonly EventRegistrationService _eventRegistrationService;

    public CampController(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IOptions<CampOptions> campOptions,
        EventCatalogService eventCatalogService,
        EventRegistrationService eventRegistrationService)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _campOptions = campOptions.Value;
        _eventCatalogService = eventCatalogService;
        _eventRegistrationService = eventRegistrationService;
    }

    [HttpGet("overview")]
    [AllowAnonymous]
    public async Task<ActionResult<CampOverviewResponse>> GetOverview()
    {
        var activeCamp = await _eventCatalogService.GetActiveCampEditionAsync(HttpContext.RequestAborted);
        if (activeCamp is null)
        {
            return Ok(BuildFallbackOverview());
        }

        var remainingCapacity = await _eventCatalogService.GetRemainingCapacityAsync(activeCamp.Id, HttpContext.RequestAborted);
        var defaultPrice = activeCamp.PriceOptions
            .Where(option => option.IsDefault || option.IsActive)
            .OrderByDescending(option => option.IsDefault)
            .ThenBy(option => option.Amount)
            .FirstOrDefault();
        var highlights = activeCamp.ContentBlocks
            .Where(block => block.IsPublished && block.BlockType == EventContentBlockType.Highlight)
            .OrderBy(block => block.SortOrder)
            .Select(block => block.Body)
            .ToArray();
        var thingsToBring = activeCamp.ContentBlocks
            .Where(block => block.IsPublished && block.BlockType == EventContentBlockType.WhatToBring)
            .OrderBy(block => block.SortOrder)
            .Select(block => block.Body)
            .ToArray();

        return Ok(new CampOverviewResponse
        {
            EventSlug = activeCamp.Slug,
            Name = activeCamp.EventSeries.Title,
            Season = activeCamp.SeasonLabel ?? activeCamp.Title,
            Tagline = activeCamp.ShortDescription,
            Location = activeCamp.Location ?? _campOptions.Location,
            SuggestedDonation = defaultPrice?.Amount ?? _campOptions.SuggestedDonation,
            StartsAtUtc = activeCamp.StartsAtUtc,
            EndsAtUtc = activeCamp.EndsAtUtc,
            RegistrationOpensAtUtc = activeCamp.RegistrationOpensAtUtc,
            RegistrationClosesAtUtc = activeCamp.RegistrationClosesAtUtc,
            IsRegistrationOpen = _eventCatalogService.IsRegistrationOpen(activeCamp, remainingCapacity),
            IsRegistrationClosingSoon = _eventCatalogService.IsRegistrationClosingSoon(activeCamp, remainingCapacity),
            Capacity = activeCamp.Capacity,
            RemainingCapacity = remainingCapacity,
            Highlights = highlights.Length == 0 ? FallbackHighlights : highlights,
            ThingsToBring = thingsToBring.Length == 0 ? FallbackThingsToBring : thingsToBring
        });
    }

    [HttpGet("registration")]
    [Authorize]
    public async Task<ActionResult<CampRegistrationResponse>> GetMyRegistration()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        if (activeCampEditionId is null)
        {
            return NotFound();
        }

        var registration = await _eventRegistrationService.GetRegistrationAsync(
            user.Id,
            activeCampEditionId.Value,
            HttpContext.RequestAborted);

        return registration is null ? NotFound() : Ok(registration);
    }

    [HttpPut("registration")]
    [Authorize]
    public async Task<ActionResult<CampRegistrationResponse>> UpsertRegistration([FromBody] UpsertCampRegistrationRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        if (activeCampEditionId is null)
        {
            return BadRequest(new { message = "Сейчас для лагеря не настроен активный выпуск мероприятия." });
        }

        var activeCamp = await _dbContext.EventEditions
            .Include(item => item.PriceOptions)
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Id == activeCampEditionId, HttpContext.RequestAborted);

        if (activeCamp is null)
        {
            return BadRequest(new { message = "Сейчас для лагеря не настроен активный выпуск мероприятия." });
        }

        try
        {
            var registration = await _eventRegistrationService.UpsertRegistrationAsync(
                user.Id,
                activeCamp,
                request,
                allowLegacyDraftMigration: true,
                HttpContext.RequestAborted);

            return Ok(registration);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpGet("registrations")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.CampManager}")]
    public async Task<ActionResult<IReadOnlyCollection<object>>> GetAllRegistrations()
    {
        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        if (activeCampEditionId is null)
        {
            return Ok(Array.Empty<object>());
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Where(item => item.EventEditionId == activeCampEditionId)
            .OrderByDescending(item => item.UpdatedAtUtc)
            .Select(item => new
            {
                item.Id,
                item.EventEditionId,
                item.Status,
                item.FullName,
                item.City,
                item.ChurchName,
                item.PhoneNumber,
                item.UpdatedAtUtc,
                AccountEmail = item.User.Email,
                AccountDisplayName = item.User.DisplayName
            })
            .ToListAsync();

        return Ok(registrations);
    }

    private CampOverviewResponse BuildFallbackOverview()
    {
        return new CampOverviewResponse
        {
            Name = _campOptions.Name,
            Season = _campOptions.Season,
            Tagline = _campOptions.Tagline,
            Location = _campOptions.Location,
            SuggestedDonation = _campOptions.SuggestedDonation,
            StartsAtUtc = NormalizeConfiguredUtc(_campOptions.StartsAtUtc),
            EndsAtUtc = NormalizeConfiguredUtc(_campOptions.EndsAtUtc),
            RegistrationOpensAtUtc = NormalizeConfiguredUtc(_campOptions.RegistrationOpensAtUtc),
            RegistrationClosesAtUtc = NormalizeConfiguredUtc(_campOptions.RegistrationClosesAtUtc),
            IsRegistrationOpen = true,
            IsRegistrationClosingSoon = false,
            Capacity = _campOptions.Capacity,
            RemainingCapacity = _campOptions.Capacity,
            Highlights = FallbackHighlights,
            ThingsToBring = FallbackThingsToBring
        };
    }

    private async Task<ApplicationUser?> GetCurrentUserAsync()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId);
    }

    private static DateTime NormalizeConfiguredUtc(DateTime value)
    {
        if (value == default)
        {
            return value;
        }

        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    private static DateTime? NormalizeConfiguredUtc(DateTime? value)
    {
        return value.HasValue ? NormalizeConfiguredUtc(value.Value) : null;
    }
}
