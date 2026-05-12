using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/google-sheets-sync")]
public sealed class AdminGoogleSheetsSyncController : ControllerBase
{
    private readonly GoogleSheetsRegistrationSyncService _syncService;

    public AdminGoogleSheetsSyncController(GoogleSheetsRegistrationSyncService syncService)
    {
        _syncService = syncService;
    }

    [HttpGet]
    public async Task<ActionResult<AdminGoogleSheetsSyncSettingsResponse>> Get(CancellationToken cancellationToken)
    {
        return Ok(await _syncService.GetAdminAsync(cancellationToken));
    }

    [HttpPut]
    public async Task<ActionResult<AdminGoogleSheetsSyncSettingsResponse>> Update(
        [FromBody] UpdateAdminGoogleSheetsSyncSettingsRequest request,
        CancellationToken cancellationToken)
    {
        return Ok(await _syncService.UpdateAsync(request, cancellationToken));
    }

    [HttpPost("sync")]
    public async Task<ActionResult<AdminGoogleSheetsSyncRunResponse>> Sync(CancellationToken cancellationToken)
    {
        return Ok(await _syncService.SyncLatestEventAsync(cancellationToken));
    }
}
