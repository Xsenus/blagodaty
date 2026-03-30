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
    private readonly TimeProvider _timeProvider;
    private readonly EventCatalogService _eventCatalogService;

    public CampController(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IOptions<CampOptions> campOptions,
        TimeProvider timeProvider,
        EventCatalogService eventCatalogService)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _campOptions = campOptions.Value;
        _timeProvider = timeProvider;
        _eventCatalogService = eventCatalogService;
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
            IsRegistrationOpen = IsRegistrationOpen(activeCamp, remainingCapacity),
            IsRegistrationClosingSoon = IsRegistrationClosingSoon(activeCamp, remainingCapacity),
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

        var registration = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .FirstOrDefaultAsync(x => x.UserId == user.Id && x.EventEditionId == activeCampEditionId, HttpContext.RequestAborted);

        if (registration is null)
        {
            return NotFound();
        }

        return Ok(MapRegistration(registration));
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
            return BadRequest(new { message = "Сейчас для лагеря не настроен активный выпуск." });
        }

        var activeCamp = await _dbContext.EventEditions
            .Include(item => item.PriceOptions)
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Id == activeCampEditionId, HttpContext.RequestAborted);

        if (activeCamp is null)
        {
            return BadRequest(new { message = "Сейчас для лагеря не настроен активный выпуск." });
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var remainingCapacity = await _eventCatalogService.GetRemainingCapacityAsync(activeCamp.Id, HttpContext.RequestAborted);
        if (request.Submit && !IsRegistrationOpen(activeCamp, remainingCapacity))
        {
            return BadRequest(new { message = "Регистрация на текущий лагерь сейчас закрыта или лимит мест уже достигнут." });
        }

        var registration = await _dbContext.CampRegistrations
            .FirstOrDefaultAsync(x => x.UserId == user.Id && x.EventEditionId == activeCamp.Id, HttpContext.RequestAborted);

        registration ??= await _dbContext.CampRegistrations
            .FirstOrDefaultAsync(x => x.UserId == user.Id && x.EventEditionId == null, HttpContext.RequestAborted);

        if (registration is null)
        {
            registration = new CampRegistration
            {
                UserId = user.Id,
                CreatedAtUtc = now
            };

            _dbContext.CampRegistrations.Add(registration);
        }

        EventPriceOption? selectedPriceOption = null;
        if (request.SelectedPriceOptionId is not null)
        {
            selectedPriceOption = activeCamp.PriceOptions
                .FirstOrDefault(option => option.Id == request.SelectedPriceOptionId.Value && option.IsActive);

            if (selectedPriceOption is null)
            {
                return BadRequest(new { message = "Выбранный тариф не найден в текущем мероприятии." });
            }
        }

        registration.EventEditionId = activeCamp.Id;
        registration.SelectedPriceOptionId = selectedPriceOption?.Id;
        registration.FullName = request.FullName.Trim();
        registration.BirthDate = request.BirthDate;
        registration.City = request.City.Trim();
        registration.ChurchName = request.ChurchName.Trim();
        registration.PhoneNumber = request.PhoneNumber.Trim();
        registration.EmergencyContactName = request.EmergencyContactName.Trim();
        registration.EmergencyContactPhone = request.EmergencyContactPhone.Trim();
        registration.AccommodationPreference = request.AccommodationPreference;
        registration.HealthNotes = request.HealthNotes?.Trim();
        registration.AllergyNotes = request.AllergyNotes?.Trim();
        registration.SpecialNeeds = request.SpecialNeeds?.Trim();
        registration.Motivation = request.Motivation?.Trim();
        registration.ConsentAccepted = request.ConsentAccepted;
        registration.Status = request.Submit ? RegistrationStatus.Submitted : RegistrationStatus.Draft;
        registration.UpdatedAtUtc = now;
        registration.SubmittedAtUtc = request.Submit ? now : null;

        await _dbContext.SaveChangesAsync();

        registration = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .FirstAsync(item => item.Id == registration.Id, HttpContext.RequestAborted);

        return Ok(MapRegistration(registration));
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
            .Include(x => x.User)
            .Where(x => x.EventEditionId == activeCampEditionId)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .Select(x => new
            {
                x.Id,
                x.EventEditionId,
                x.Status,
                x.FullName,
                x.City,
                x.ChurchName,
                x.PhoneNumber,
                x.UpdatedAtUtc,
                AccountEmail = x.User.Email,
                AccountDisplayName = x.User.DisplayName
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
            StartsAtUtc = _campOptions.StartsAtUtc,
            EndsAtUtc = _campOptions.EndsAtUtc,
            RegistrationOpensAtUtc = _campOptions.RegistrationOpensAtUtc,
            RegistrationClosesAtUtc = _campOptions.RegistrationClosesAtUtc,
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

        return await _userManager.Users.FirstOrDefaultAsync(x => x.Id == userId);
    }

    private bool IsRegistrationOpen(EventEdition edition, int? remainingCapacity)
    {
        if (edition.Status != EventEditionStatus.RegistrationOpen)
        {
            return false;
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
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

    private bool IsRegistrationClosingSoon(EventEdition edition, int? remainingCapacity)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        return IsRegistrationOpen(edition, remainingCapacity) &&
               edition.RegistrationClosesAtUtc.HasValue &&
               edition.RegistrationClosesAtUtc.Value <= now.AddDays(5);
    }

    private static CampRegistrationResponse MapRegistration(CampRegistration registration)
    {
        return new CampRegistrationResponse
        {
            Id = registration.Id,
            EventEditionId = registration.EventEditionId,
            EventSlug = registration.EventEdition?.Slug,
            SelectedPriceOptionId = registration.SelectedPriceOptionId,
            Status = registration.Status,
            FullName = registration.FullName,
            BirthDate = registration.BirthDate,
            City = registration.City,
            ChurchName = registration.ChurchName,
            PhoneNumber = registration.PhoneNumber,
            EmergencyContactName = registration.EmergencyContactName,
            EmergencyContactPhone = registration.EmergencyContactPhone,
            AccommodationPreference = registration.AccommodationPreference,
            HealthNotes = registration.HealthNotes,
            AllergyNotes = registration.AllergyNotes,
            SpecialNeeds = registration.SpecialNeeds,
            Motivation = registration.Motivation,
            ConsentAccepted = registration.ConsentAccepted,
            CreatedAtUtc = registration.CreatedAtUtc,
            UpdatedAtUtc = registration.UpdatedAtUtc,
            SubmittedAtUtc = registration.SubmittedAtUtc
        };
    }
}
