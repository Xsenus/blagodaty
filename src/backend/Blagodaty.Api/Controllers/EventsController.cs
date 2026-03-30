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

    public EventsController(EventCatalogService eventCatalogService)
    {
        _eventCatalogService = eventCatalogService;
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
}
