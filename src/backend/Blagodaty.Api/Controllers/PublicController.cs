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
    private readonly SiteSettingsService _siteSettingsService;

    public PublicController(
        ExternalAuthProviderService externalAuthProviderService,
        SiteSettingsService siteSettingsService)
    {
        _externalAuthProviderService = externalAuthProviderService;
        _siteSettingsService = siteSettingsService;
    }

    [HttpGet("auth/providers")]
    public async Task<ActionResult<PublicExternalAuthSettingsResponse>> GetExternalAuthProviders()
    {
        return Ok(new PublicExternalAuthSettingsResponse
        {
            Providers = await _externalAuthProviderService.GetPublicProvidersAsync(HttpContext.RequestAborted)
        });
    }

    [HttpGet("site-settings")]
    public async Task<ActionResult<PublicSiteSettingsResponse>> GetSiteSettings()
    {
        return Ok(await _siteSettingsService.GetPublicAsync(HttpContext.RequestAborted));
    }
}
