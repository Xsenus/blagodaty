using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Contracts.Public;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blagodaty.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/events")]
public sealed class EventsController : ControllerBase
{
    private readonly EventCatalogService _eventCatalogService;
    private readonly EventRegistrationService _eventRegistrationService;

    public EventsController(
        EventCatalogService eventCatalogService,
        EventRegistrationService eventRegistrationService)
    {
        _eventCatalogService = eventCatalogService;
        _eventRegistrationService = eventRegistrationService;
    }

    [HttpGet]
    public async Task<ActionResult<PublicEventsResponse>> GetEvents()
    {
        return Ok(new PublicEventsResponse
        {
            Events = await _eventCatalogService.GetPublicEventsAsync(HttpContext.RequestAborted)
        });
    }

    [HttpGet("{slug}")]
    public async Task<ActionResult<PublicEventDetailsResponse>> GetEvent([FromRoute] string slug)
    {
        var response = await _eventCatalogService.GetPublicEventBySlugAsync(slug, HttpContext.RequestAborted);
        return response is null ? NotFound() : Ok(response);
    }

    [HttpPost("{slug}/registration")]
    public async Task<ActionResult<CampRegistrationResponse>> SubmitGuestRegistration(
        [FromRoute] string slug,
        [FromBody] UpsertCampRegistrationRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var eventEdition = await _eventRegistrationService.GetAccessibleEventEditionBySlugAsync(
            slug,
            HttpContext.RequestAborted);
        if (eventEdition is null)
        {
            return NotFound();
        }

        try
        {
            return Ok(await _eventRegistrationService.SubmitGuestRegistrationAsync(
                eventEdition,
                request,
                HttpContext.RequestAborted));
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }
}
