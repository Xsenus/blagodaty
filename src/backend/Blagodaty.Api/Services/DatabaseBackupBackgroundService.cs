namespace Blagodaty.Api.Services;

public sealed class DatabaseBackupBackgroundService : BackgroundService
{
    private readonly DatabaseBackupService _databaseBackupService;
    private readonly ILogger<DatabaseBackupBackgroundService> _logger;

    public DatabaseBackupBackgroundService(
        DatabaseBackupService databaseBackupService,
        ILogger<DatabaseBackupBackgroundService> logger)
    {
        _databaseBackupService = databaseBackupService;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RunCycleAsync(stoppingToken);

        using var timer = new PeriodicTimer(_databaseBackupService.PollingInterval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await RunCycleAsync(stoppingToken);
        }
    }

    private async Task RunCycleAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _databaseBackupService.EnsureScheduledBackupsAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to process scheduled database backups.");
        }
    }
}
