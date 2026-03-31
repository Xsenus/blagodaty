namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminGalleryAssetDto
{
    public Guid Id { get; init; }
    public string Kind { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string ContentType { get; init; } = string.Empty;
    public string FileExtension { get; init; } = string.Empty;
    public string OriginalFileName { get; init; } = string.Empty;
    public string DiskPath { get; init; } = string.Empty;
    public long FileSizeBytes { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime UpdatedAtUtc { get; init; }
    public string Url { get; init; } = string.Empty;
    public bool ExistsOnDisk { get; init; }
}

public sealed class AdminGalleryAssetsResponse
{
    public required IReadOnlyCollection<AdminGalleryAssetDto> Items { get; init; }
}

public sealed class AdminGalleryQueryRequest
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 24;
    public string? Search { get; init; }
}

public sealed class UpdateAdminGalleryAssetRequest
{
    public string? Name { get; init; }
    public string? Description { get; init; }
}
