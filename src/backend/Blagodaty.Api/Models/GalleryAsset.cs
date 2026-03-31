namespace Blagodaty.Api.Models;

public sealed class GalleryAsset
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public GalleryAssetKind Kind { get; set; } = GalleryAssetKind.File;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string ContentType { get; set; } = "application/octet-stream";
    public string FileExtension { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;
    public string DiskPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public enum GalleryAssetKind
{
    Image = 0,
    Video = 1,
    File = 2
}
