using Blagodaty.Api.Models;

namespace Blagodaty.Api.Services;

public sealed class GalleryStorageService
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".avif", ".jfif"
    };

    private static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"
    };

    private static readonly HashSet<string> FileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf", ".zip", ".rar", ".7z"
    };

    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _hostEnvironment;

    public GalleryStorageService(IConfiguration configuration, IHostEnvironment hostEnvironment)
    {
        _configuration = configuration;
        _hostEnvironment = hostEnvironment;
    }

    public long MaxUploadFileSizeBytes =>
        _configuration.GetValue<long?>("Storage:MaxUploadFileSizeBytes") ?? 100 * 1024 * 1024;

    public string RootDirectory
    {
        get
        {
            var configured = _configuration["Storage:UploadsRoot"];
            if (string.IsNullOrWhiteSpace(configured))
            {
                return Path.Combine(_hostEnvironment.ContentRootPath, "storage", "uploads");
            }

            return Path.IsPathRooted(configured)
                ? Path.GetFullPath(configured)
                : Path.GetFullPath(Path.Combine(_hostEnvironment.ContentRootPath, configured));
        }
    }

    public string EnsureAllowedExtension(string? fileName)
    {
        var extension = Path.GetExtension(fileName ?? string.Empty);
        if (string.IsNullOrWhiteSpace(extension))
        {
            throw new InvalidOperationException("Не удалось определить расширение файла.");
        }

        extension = extension.ToLowerInvariant();
        if (!ImageExtensions.Contains(extension) && !VideoExtensions.Contains(extension) && !FileExtensions.Contains(extension))
        {
            throw new InvalidOperationException("Недопустимый формат файла. Разрешены изображения, видео и основные документы.");
        }

        return extension;
    }

    public GalleryAssetKind DetectKind(string extension, string? contentType)
    {
        if (ImageExtensions.Contains(extension) || (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)))
        {
            return GalleryAssetKind.Image;
        }

        if (VideoExtensions.Contains(extension) || (!string.IsNullOrWhiteSpace(contentType) && contentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)))
        {
            return GalleryAssetKind.Video;
        }

        return GalleryAssetKind.File;
    }

    public string BuildRelativePath(Guid assetId, string extension)
    {
        var now = DateTime.UtcNow;
        return Path.Combine(
            "gallery",
            now.ToString("yyyy"),
            now.ToString("MM"),
            $"{assetId:N}{extension.ToLowerInvariant()}");
    }

    public string BuildAbsolutePath(string relativePath)
    {
        var normalized = relativePath
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar)
            .TrimStart(Path.DirectorySeparatorChar);

        var absolute = Path.GetFullPath(Path.Combine(RootDirectory, normalized));
        var root = Path.GetFullPath(RootDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        if (!absolute.StartsWith(root, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Неверный путь к файлу галереи.");
        }

        return absolute;
    }

    public string BuildRelativeUrl(string relativePath)
    {
        var normalized = relativePath.Replace('\\', '/').TrimStart('/');
        return $"/uploads/{normalized}";
    }

    public string BuildPublicUrl(string relativePath, HttpRequest? request = null)
    {
        var relativeUrl = BuildRelativeUrl(relativePath);
        var configuredBaseUrl = _configuration["Storage:PublicBaseUrl"];
        if (!string.IsNullOrWhiteSpace(configuredBaseUrl))
        {
            return $"{configuredBaseUrl.TrimEnd('/')}{relativeUrl}";
        }

        if (request is null)
        {
            return relativeUrl;
        }

        return $"{request.Scheme}://{request.Host}{request.PathBase}{relativeUrl}";
    }

    public async Task WriteFileToDiskAsync(string relativePath, byte[] content, CancellationToken cancellationToken = default)
    {
        var absolutePath = BuildAbsolutePath(relativePath);
        var directory = Path.GetDirectoryName(absolutePath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        await File.WriteAllBytesAsync(absolutePath, content, cancellationToken);
    }
}
