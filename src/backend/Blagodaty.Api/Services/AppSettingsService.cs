using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed class AppSettingsService
{
    private readonly AppDbContext _dbContext;
    private readonly IConfiguration _configuration;
    private readonly TimeProvider _timeProvider;

    public AppSettingsService(AppDbContext dbContext, IConfiguration configuration, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _configuration = configuration;
        _timeProvider = timeProvider;
    }

    public async Task<string?> GetStringAsync(string key, string? configPath = null, CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(key);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            return null;
        }

        var row = await _dbContext.AppSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Key == normalizedKey, cancellationToken);

        if (row is not null)
        {
            return row.Value;
        }

        return string.IsNullOrWhiteSpace(configPath) ? null : _configuration[configPath];
    }

    public async Task<bool> GetBooleanAsync(
        string key,
        bool fallback = false,
        string? configPath = null,
        CancellationToken cancellationToken = default)
    {
        var raw = await GetStringAsync(key, configPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        return raw.Trim().ToLowerInvariant() switch
        {
            "1" or "true" or "yes" or "on" => true,
            "0" or "false" or "no" or "off" => false,
            _ => fallback
        };
    }

    public async Task<Dictionary<string, AppSetting>> GetRowsByKeysAsync(
        IEnumerable<string> keys,
        CancellationToken cancellationToken = default)
    {
        var normalizedKeys = keys
            .Select(NormalizeKey)
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        return await _dbContext.AppSettings
            .Where(item => normalizedKeys.Contains(item.Key))
            .ToDictionaryAsync(item => item.Key, item => item, cancellationToken);
    }

    public async Task UpsertAsync(
        string key,
        string? value,
        string? description,
        bool isSecret,
        CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(key);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            throw new InvalidOperationException("Setting key is required.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var row = await _dbContext.AppSettings.FirstOrDefaultAsync(item => item.Key == normalizedKey, cancellationToken);
        if (row is null)
        {
            row = new AppSetting
            {
                Id = Guid.NewGuid(),
                Key = normalizedKey,
                CreatedAtUtc = now
            };
            _dbContext.AppSettings.Add(row);
        }

        row.Value = NormalizeValue(value);
        row.Description = NormalizeValue(description);
        row.IsSecret = isSecret;
        row.UpdatedAtUtc = now;
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        var normalizedKey = NormalizeKey(key);
        if (string.IsNullOrWhiteSpace(normalizedKey))
        {
            return;
        }

        var row = await _dbContext.AppSettings.FirstOrDefaultAsync(item => item.Key == normalizedKey, cancellationToken);
        if (row is null)
        {
            return;
        }

        _dbContext.AppSettings.Remove(row);
    }

    public static string? NormalizeValue(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    public static string? MaskSecret(string? value)
    {
        var normalized = NormalizeValue(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length <= 6)
        {
            return new string('*', normalized.Length);
        }

        return $"{normalized[..2]}***{normalized[^2..]}";
    }

    private static string NormalizeKey(string? key)
    {
        return key?.Trim() ?? string.Empty;
    }
}
