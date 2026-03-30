using Blagodaty.Api.Contracts.Public;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blagodaty.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/public")]
public sealed class PublicController : ControllerBase
{
    private readonly ExternalAuthProviderService _externalAuthProviderService;

    public PublicController(ExternalAuthProviderService externalAuthProviderService)
    {
        _externalAuthProviderService = externalAuthProviderService;
    }

    [HttpGet("auth/providers")]
    public async Task<ActionResult<PublicExternalAuthSettingsResponse>> GetExternalAuthProviders()
    {
        return Ok(new PublicExternalAuthSettingsResponse
        {
            Providers = await _externalAuthProviderService.GetPublicProvidersAsync(HttpContext.RequestAborted)
        });
    }
}
