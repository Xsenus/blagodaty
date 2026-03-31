using System.Globalization;
using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/backups")]
public sealed class AdminBackupsController : ControllerBase
{
    private readonly DatabaseBackupService _databaseBackupService;
    private readonly AppSettingsService _appSettingsService;
    private readonly AppDbContext _dbContext;

    public AdminBackupsController(
        DatabaseBackupService databaseBackupService,
        AppSettingsService appSettingsService,
        AppDbContext dbContext)
    {
        _databaseBackupService = databaseBackupService;
        _appSettingsService = appSettingsService;
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<AdminDatabaseBackupsOverviewResponse>> GetOverview(CancellationToken cancellationToken)
    {
        var overview = await _databaseBackupService.GetOverviewAsync(cancellationToken);
        return Ok(MapOverview(overview));
    }

    [HttpPost]
    public async Task<ActionResult<AdminDatabaseBackupCreateResponse>> CreateBackup(
        [FromBody] CreateAdminDatabaseBackupRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            var created = await _databaseBackupService.CreateManualBackupAsync(
                request?.SendToTelegramAdmins == true,
                cancellationToken);

            return Ok(new AdminDatabaseBackupCreateResponse
            {
                Backup = MapItem(created.Backup),
                DownloadUrl = created.DownloadPath,
                Delivery = created.Delivery is null
                    ? null
                    : new AdminDatabaseBackupDeliveryDto
                    {
                        FileName = created.Delivery.FileName,
                        CandidateRecipients = created.Delivery.CandidateRecipients,
                        DeliveredCount = created.Delivery.DeliveredCount
                    }
            });
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("send")]
    public async Task<ActionResult<AdminDatabaseBackupDeliveryDto>> SendBackupToTelegramAdmins(
        [FromBody] SendAdminDatabaseBackupRequest? request,
        CancellationToken cancellationToken)
    {
        try
        {
            var delivery = await _databaseBackupService.SendBackupToAdminsAsync(
                request?.RelativePath,
                cancellationToken);

            return Ok(new AdminDatabaseBackupDeliveryDto
            {
                FileName = delivery.FileName,
                CandidateRecipients = delivery.CandidateRecipients,
                DeliveredCount = delivery.DeliveredCount
            });
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpPut("settings")]
    public async Task<ActionResult<AdminDatabaseBackupsOverviewResponse>> UpdateSettings(
        [FromBody] UpdateAdminDatabaseBackupSettingsRequest request,
        CancellationToken cancellationToken)
    {
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.Enabled, request.AutomaticEnabled ? "true" : "false", "Database backups enabled", false, cancellationToken);
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.ScheduleLocal, request.ScheduleLocal, "Database backup local schedule", false, cancellationToken);
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.RetentionDays, request.RetentionDays.ToString(CultureInfo.InvariantCulture), "Database backup retention days", false, cancellationToken);
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.TelegramDeliveryEnabled, request.TelegramDeliveryEnabled ? "true" : "false", "Send database backups to Telegram admins", false, cancellationToken);
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.Directory, request.Directory, "Database backup directory", false, cancellationToken);
        await _appSettingsService.UpsertAsync(DatabaseBackupSettingKeys.PgDumpPath, request.PgDumpPath, "Database backup pg_dump command", false, cancellationToken);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var overview = await _databaseBackupService.GetOverviewAsync(cancellationToken);
        return Ok(MapOverview(overview));
    }

    [HttpGet("download")]
    public IActionResult DownloadBackup([FromQuery] string? relativePath)
    {
        var resolvedPath = _databaseBackupService.ResolveBackupPath(relativePath);
        if (string.IsNullOrWhiteSpace(resolvedPath))
        {
            return NotFound(new { message = "Файл резервной копии не найден." });
        }

        var fileName = Path.GetFileName(resolvedPath);
        return PhysicalFile(resolvedPath, "application/octet-stream", fileName, enableRangeProcessing: true);
    }

    private static AdminDatabaseBackupsOverviewResponse MapOverview(DatabaseBackupOverview overview)
    {
        return new AdminDatabaseBackupsOverviewResponse
        {
            AutomaticEnabled = overview.AutomaticEnabled,
            ScheduleLocal = overview.ScheduleLocal,
            RetentionDays = overview.RetentionDays,
            RootDirectory = overview.RootDirectory,
            TimeZone = overview.TimeZone,
            PgDumpCommand = overview.PgDumpCommand,
            TelegramDeliveryEnabled = overview.TelegramDeliveryEnabled,
            AdminTelegramRecipientsCount = overview.AdminTelegramRecipientsCount,
            Items = overview.Items.Select(MapItem).ToArray()
        };
    }

    private static AdminDatabaseBackupItemDto MapItem(DatabaseBackupFileInfo item)
    {
        return new AdminDatabaseBackupItemDto
        {
            FileName = item.FileName,
            RelativePath = item.RelativePath,
            SizeBytes = item.SizeBytes,
            CreatedAtUtc = item.CreatedAtUtc,
            Trigger = item.Trigger
        };
    }
}
