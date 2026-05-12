namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminGoogleSheetsSyncSettingsResponse
{
    public required bool Enabled { get; init; }
    public string? SpreadsheetId { get; init; }
    public string? SheetName { get; init; }
    public required bool HasServiceAccountJson { get; init; }
    public string? ServiceAccountEmail { get; init; }
    public DateTime? LastSyncedAtUtc { get; init; }
    public string? LastError { get; init; }
}

public sealed class UpdateAdminGoogleSheetsSyncSettingsRequest
{
    public bool Enabled { get; init; }
    public string? SpreadsheetId { get; init; }
    public string? SheetName { get; init; }
    public string? ServiceAccountJson { get; init; }
}

public sealed class AdminGoogleSheetsSyncRunResponse
{
    public required bool Synced { get; init; }
    public required string Message { get; init; }
    public int? RowsWritten { get; init; }
    public DateTime? SyncedAtUtc { get; init; }
}
