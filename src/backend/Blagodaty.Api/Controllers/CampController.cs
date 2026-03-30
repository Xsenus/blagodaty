using System.Security.Claims;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Blagodaty.Api.Security;
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
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CampOptions _campOptions;
    private readonly TimeProvider _timeProvider;

    public CampController(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IOptions<CampOptions> campOptions,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _campOptions = campOptions.Value;
        _timeProvider = timeProvider;
    }

    [HttpGet("overview")]
    [AllowAnonymous]
    public ActionResult<CampOverviewResponse> GetOverview()
    {
        return Ok(new CampOverviewResponse
        {
            Name = _campOptions.Name,
            Season = _campOptions.Season,
            Tagline = _campOptions.Tagline,
            Location = _campOptions.Location,
            SuggestedDonation = _campOptions.SuggestedDonation,
            StartsAtUtc = _campOptions.StartsAtUtc,
            EndsAtUtc = _campOptions.EndsAtUtc,
            Highlights =
            [
                "Походы и выезды в горы Алтая вместе с церковной командой.",
                "Палатки, домики, костры и теплые вечерние встречи под открытым небом.",
                "Поклонение, молитва, наставничество и живое братское общение."
            ],
            ThingsToBring =
            [
                "Спальник, коврик, фонарик и базовую походную одежду.",
                "Средства личной гигиены, теплые вещи и дождевик на случай перемены погоды.",
                "Библию, блокнот, ручку и открытое сердце к Богу и людям."
            ]
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

        var registration = await _dbContext.CampRegistrations.FirstOrDefaultAsync(x => x.UserId == user.Id);
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

        var registration = await _dbContext.CampRegistrations.FirstOrDefaultAsync(x => x.UserId == user.Id);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        if (registration is null)
        {
            registration = new CampRegistration
            {
                UserId = user.Id,
                CreatedAtUtc = now
            };

            _dbContext.CampRegistrations.Add(registration);
        }

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

        return Ok(MapRegistration(registration));
    }

    [HttpGet("registrations")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.CampManager}")]
    public async Task<ActionResult<IReadOnlyCollection<object>>> GetAllRegistrations()
    {
        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(x => x.User)
            .OrderByDescending(x => x.UpdatedAtUtc)
            .Select(x => new
            {
                x.Id,
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

    private async Task<ApplicationUser?> GetCurrentUserAsync()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await _userManager.Users.FirstOrDefaultAsync(x => x.Id == userId);
    }

    private static CampRegistrationResponse MapRegistration(CampRegistration registration)
    {
        return new CampRegistrationResponse
        {
            Id = registration.Id,
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
