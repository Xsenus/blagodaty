namespace Blagodaty.Api.Services;

public static class DatabaseBackupSettingKeys
{
    public const string Enabled = "database_backup_enabled";
    public const string ScheduleLocal = "database_backup_schedule_local";
    public const string RetentionDays = "database_backup_retention_days";
    public const string TelegramDeliveryEnabled = "database_backup_telegram_delivery_enabled";
    public const string Directory = "database_backup_directory";
    public const string PgDumpPath = "database_backup_pg_dump_path";

    public static IReadOnlyCollection<string> All { get; } =
    [
        Enabled,
        ScheduleLocal,
        RetentionDays,
        TelegramDeliveryEnabled,
        Directory,
        PgDumpPath
    ];
}
