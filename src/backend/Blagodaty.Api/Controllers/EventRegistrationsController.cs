using System.Security.Claims;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Models;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/events/{slug}/registration")]
public sealed class EventRegistrationsController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly EventRegistrationService _eventRegistrationService;

    public EventRegistrationsController(
        UserManager<ApplicationUser> userManager,
        EventRegistrationService eventRegistrationService)
    {
        _userManager = userManager;
        _eventRegistrationService = eventRegistrationService;
    }

    [HttpGet]
    public async Task<ActionResult<CampRegistrationResponse>> GetRegistration([FromRoute] string slug)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var eventEdition = await _eventRegistrationService.GetAccessibleEventEditionBySlugAsync(slug, HttpContext.RequestAborted);
        if (eventEdition is null)
        {
            return NotFound();
        }

        var registration = await _eventRegistrationService.GetRegistrationAsync(
            user.Id,
            eventEdition.Id,
            HttpContext.RequestAborted);

        return registration is null ? NotFound() : Ok(registration);
    }

    [HttpPut]
    public async Task<ActionResult<CampRegistrationResponse>> UpsertRegistration(
        [FromRoute] string slug,
        [FromBody] UpsertCampRegistrationRequest request)
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

        var eventEdition = await _eventRegistrationService.GetAccessibleEventEditionBySlugAsync(slug, HttpContext.RequestAborted);
        if (eventEdition is null)
        {
            return NotFound();
        }

        try
        {
            var registration = await _eventRegistrationService.UpsertRegistrationAsync(
                user.Id,
                eventEdition,
                request,
                allowLegacyDraftMigration: false,
                HttpContext.RequestAborted);

            return Ok(registration);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
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
}
