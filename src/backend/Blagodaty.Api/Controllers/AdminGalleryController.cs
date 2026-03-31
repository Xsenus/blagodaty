using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/gallery")]
public sealed class AdminGalleryController : ControllerBase
{
    private const int DefaultPageSize = 24;
    private const int MaxPageSize = 120;
    private const long RequestLimitBytes = 250L * 1024L * 1024L;

    private readonly AppDbContext _dbContext;
    private readonly GalleryStorageService _galleryStorageService;

    public AdminGalleryController(AppDbContext dbContext, GalleryStorageService galleryStorageService)
    {
        _dbContext = dbContext;
        _galleryStorageService = galleryStorageService;
    }

    [HttpGet]
    public async Task<ActionResult<AdminPagedResponse<AdminGalleryAssetDto>>> GetGallery(
        [FromQuery] AdminGalleryQueryRequest request,
        CancellationToken cancellationToken)
    {
        var safePageSize = Math.Clamp(request.PageSize, 1, MaxPageSize);
        var normalizedSearch = request.Search?.Trim();

        var query = _dbContext.GalleryAssets.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(normalizedSearch))
        {
            var pattern = $"%{normalizedSearch}%";
            query = query.Where(asset =>
                EF.Functions.ILike(asset.Name, pattern)
                || (asset.Description != null && EF.Functions.ILike(asset.Description, pattern))
                || EF.Functions.ILike(asset.OriginalFileName, pattern));
        }

        var totalItems = await query.CountAsync(cancellationToken);
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalItems / (double)safePageSize));
        var safePage = Math.Clamp(request.Page, 1, totalPages);

        var items = await query
            .OrderByDescending(asset => asset.CreatedAtUtc)
            .Skip((safePage - 1) * safePageSize)
            .Take(safePageSize)
            .ToListAsync(cancellationToken);

        return Ok(new AdminPagedResponse<AdminGalleryAssetDto>
        {
            Items = items.Select(asset => MapAsset(asset, Request)).ToArray(),
            Page = safePage,
            PageSize = safePageSize,
            TotalItems = totalItems,
            TotalPages = totalPages
        });
    }

    [HttpPost]
    [RequestFormLimits(MultipartBodyLengthLimit = RequestLimitBytes)]
    public async Task<ActionResult<AdminGalleryAssetsResponse>> Upload(
        [FromForm] List<IFormFile> files,
        CancellationToken cancellationToken)
    {
        if (files.Count == 0)
        {
            return BadRequest(new { message = "Выберите хотя бы один файл для загрузки." });
        }

        var preparedItems = new List<(GalleryAsset Asset, byte[] Content)>(files.Count);
        foreach (var file in files.Where(file => file.Length > 0))
        {
            if (file.Length > _galleryStorageService.MaxUploadFileSizeBytes)
            {
                return BadRequest(new
                {
                    message = $"Файл {file.FileName} слишком большой. Максимум {FormatMegabytes(_galleryStorageService.MaxUploadFileSizeBytes)}."
                });
            }

            string extension;
            try
            {
                extension = _galleryStorageService.EnsureAllowedExtension(file.FileName);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }

            await using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream, cancellationToken);

            var asset = new GalleryAsset
            {
                Id = Guid.NewGuid(),
                Kind = _galleryStorageService.DetectKind(extension, file.ContentType),
                Name = BuildAssetName(file.FileName),
                ContentType = TrimToLength(string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType, 200),
                FileExtension = extension,
                OriginalFileName = TrimToLength(file.FileName, 260),
                DiskPath = string.Empty,
                FileSizeBytes = file.Length,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };

            asset.DiskPath = _galleryStorageService.BuildRelativePath(asset.Id, extension);
            preparedItems.Add((asset, memoryStream.ToArray()));
        }

        if (preparedItems.Count == 0)
        {
            return BadRequest(new { message = "Не удалось загрузить файлы: все выбранные элементы оказались пустыми." });
        }

        foreach (var (asset, content) in preparedItems)
        {
            await _galleryStorageService.WriteFileToDiskAsync(asset.DiskPath, content, cancellationToken);
        }

        var createdItems = preparedItems.Select(item => item.Asset).ToArray();
        _dbContext.GalleryAssets.AddRange(createdItems);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(new AdminGalleryAssetsResponse
        {
            Items = createdItems
                .OrderByDescending(asset => asset.CreatedAtUtc)
                .Select(asset => MapAsset(asset, Request))
                .ToArray()
        });
    }

    [HttpPatch("{assetId:guid}")]
    public async Task<ActionResult<AdminGalleryAssetDto>> Update(
        [FromRoute] Guid assetId,
        [FromBody] UpdateAdminGalleryAssetRequest request,
        CancellationToken cancellationToken)
    {
        var asset = await _dbContext.GalleryAssets.FirstOrDefaultAsync(item => item.Id == assetId, cancellationToken);
        if (asset is null)
        {
            return NotFound(new { message = "Файл галереи не найден." });
        }

        if (request.Name is not null)
        {
            var normalizedName = request.Name.Trim();
            asset.Name = string.IsNullOrWhiteSpace(normalizedName) ? asset.Name : TrimToLength(normalizedName, 180);
        }

        if (request.Description is not null)
        {
            asset.Description = string.IsNullOrWhiteSpace(request.Description) ? null : TrimToLength(request.Description.Trim(), 1000);
        }

        asset.UpdatedAtUtc = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(MapAsset(asset, Request));
    }

    [HttpDelete("{assetId:guid}")]
    public async Task<ActionResult<object>> Delete([FromRoute] Guid assetId, CancellationToken cancellationToken)
    {
        var asset = await _dbContext.GalleryAssets.FirstOrDefaultAsync(item => item.Id == assetId, cancellationToken);
        if (asset is null)
        {
            return Ok(new { ok = true });
        }

        var absolutePath = _galleryStorageService.BuildAbsolutePath(asset.DiskPath);
        if (System.IO.File.Exists(absolutePath))
        {
            System.IO.File.Delete(absolutePath);
        }

        _dbContext.GalleryAssets.Remove(asset);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { ok = true });
    }

    private AdminGalleryAssetDto MapAsset(GalleryAsset asset, HttpRequest request)
    {
        var absolutePath = _galleryStorageService.BuildAbsolutePath(asset.DiskPath);
        return new AdminGalleryAssetDto
        {
            Id = asset.Id,
            Kind = asset.Kind.ToString(),
            Name = asset.Name,
            Description = asset.Description,
            ContentType = asset.ContentType,
            FileExtension = asset.FileExtension,
            OriginalFileName = asset.OriginalFileName,
            DiskPath = asset.DiskPath,
            FileSizeBytes = asset.FileSizeBytes,
            CreatedAtUtc = asset.CreatedAtUtc,
            UpdatedAtUtc = asset.UpdatedAtUtc,
            Url = _galleryStorageService.BuildPublicUrl(asset.DiskPath, request),
            ExistsOnDisk = System.IO.File.Exists(absolutePath)
        };
    }

    private static string FormatMegabytes(long bytes)
    {
        var value = bytes / 1024d / 1024d;
        return $"{value:0.#} МБ";
    }

    private static string TrimToLength(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength];
    }

    private static string BuildAssetName(string fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName);
        if (string.IsNullOrWhiteSpace(name))
        {
            name = Path.GetFileName(fileName);
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            name = "Файл";
        }

        return TrimToLength(name.Trim(), 180);
    }
}
