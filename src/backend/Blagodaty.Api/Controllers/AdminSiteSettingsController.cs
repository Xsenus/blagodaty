using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/site-settings")]
public sealed class AdminSiteSettingsController : ControllerBase
{
    private readonly SiteSettingsService _siteSettingsService;

    public AdminSiteSettingsController(SiteSettingsService siteSettingsService)
    {
        _siteSettingsService = siteSettingsService;
    }

    [HttpGet]
    public async Task<ActionResult<AdminSiteSettingsResponse>> Get(CancellationToken cancellationToken)
    {
        return Ok(await _siteSettingsService.GetAdminAsync(cancellationToken));
    }

    [HttpPut]
    public async Task<ActionResult<AdminSiteSettingsResponse>> Update(
        [FromBody] UpdateAdminSiteSettingsRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        return Ok(await _siteSettingsService.UpdateAsync(request, cancellationToken));
    }
}
