namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminDatabaseBackupItemDto
{
    public string FileName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public string Trigger { get; set; } = string.Empty;
}

public sealed class AdminDatabaseBackupsOverviewResponse
{
    public bool AutomaticEnabled { get; set; }
    public string ScheduleLocal { get; set; } = string.Empty;
    public int RetentionDays { get; set; }
    public string RootDirectory { get; set; } = string.Empty;
    public string TimeZone { get; set; } = string.Empty;
    public string PgDumpCommand { get; set; } = string.Empty;
    public bool TelegramDeliveryEnabled { get; set; }
    public int AdminTelegramRecipientsCount { get; set; }
    public AdminDatabaseBackupItemDto[] Items { get; set; } = [];
}

public sealed class CreateAdminDatabaseBackupRequest
{
    public bool SendToTelegramAdmins { get; set; }
}

public sealed class UpdateAdminDatabaseBackupSettingsRequest
{
    public bool AutomaticEnabled { get; set; }
    public string ScheduleLocal { get; set; } = "03:00";
    public int RetentionDays { get; set; } = 14;
    public bool TelegramDeliveryEnabled { get; set; }
    public string? Directory { get; set; }
    public string? PgDumpPath { get; set; }
}

public sealed class SendAdminDatabaseBackupRequest
{
    public string? RelativePath { get; set; }
}

public sealed class AdminDatabaseBackupDeliveryDto
{
    public string FileName { get; set; } = string.Empty;
    public int CandidateRecipients { get; set; }
    public int DeliveredCount { get; set; }
}

public sealed class AdminDatabaseBackupCreateResponse
{
    public AdminDatabaseBackupItemDto Backup { get; set; } = new();
    public string DownloadUrl { get; set; } = string.Empty;
    public AdminDatabaseBackupDeliveryDto? Delivery { get; set; }
}
