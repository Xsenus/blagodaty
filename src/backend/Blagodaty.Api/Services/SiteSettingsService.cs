using System.Text.Json;
using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Contracts.Public;
using Blagodaty.Api.Data;

namespace Blagodaty.Api.Services;

public sealed class SiteSettingsService
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly HashSet<string> KnownPresets = new(StringComparer.OrdinalIgnoreCase)
    {
        "telegram",
        "vk",
        "youtube",
        "rutube",
        "instagram",
        "website",
        "email",
        "phone",
        "custom"
    };

    private readonly AppSettingsService _appSettingsService;
    private readonly AppDbContext _dbContext;

    public SiteSettingsService(AppSettingsService appSettingsService, AppDbContext dbContext)
    {
        _appSettingsService = appSettingsService;
        _dbContext = dbContext;
    }

    public async Task<AdminSiteSettingsResponse> GetAdminAsync(CancellationToken cancellationToken = default)
    {
        var config = await LoadConfigAsync(cancellationToken);
        return MapAdmin(config);
    }

    public async Task<PublicSiteSettingsResponse> GetPublicAsync(CancellationToken cancellationToken = default)
    {
        var config = await LoadConfigAsync(cancellationToken);
        return MapPublic(config);
    }

    public async Task<AdminSiteSettingsResponse> UpdateAsync(UpdateAdminSiteSettingsRequest request, CancellationToken cancellationToken = default)
    {
        var config = new SiteSocialLinksConfigModel
        {
            SocialLinksEnabled = request.SocialLinksEnabled,
            SocialLinksTitle = AppSettingsService.NormalizeValue(request.SocialLinksTitle) ?? "Мы на связи",
            SocialLinksDescription = AppSettingsService.NormalizeValue(request.SocialLinksDescription),
            SocialLinks = request.SocialLinks
                .Select((item, index) => NormalizeLink(item, index))
                .Where(item => !string.IsNullOrWhiteSpace(item.Url))
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray()
        };

        var serialized = JsonSerializer.Serialize(config, SerializerOptions);
        await _appSettingsService.UpsertAsync(
            SiteSettingKeys.SocialLinksConfigJson,
            serialized,
            "Public site social links configuration",
            false,
            cancellationToken);

        await _dbContext.SaveChangesAsync(cancellationToken);
        return MapAdmin(config);
    }

    private async Task<SiteSocialLinksConfigModel> LoadConfigAsync(CancellationToken cancellationToken)
    {
        var raw = await _appSettingsService.GetStringAsync(SiteSettingKeys.SocialLinksConfigJson, null, cancellationToken);
        if (!string.IsNullOrWhiteSpace(raw))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<SiteSocialLinksConfigModel>(raw, SerializerOptions);
                if (parsed is not null)
                {
                    return NormalizeConfig(parsed);
                }
            }
            catch (JsonException)
            {
                // fall back to defaults below
            }
        }

        return CreateDefaultConfig();
    }

    private static SiteSocialLinksConfigModel CreateDefaultConfig()
    {
        return new SiteSocialLinksConfigModel
        {
            SocialLinksEnabled = false,
            SocialLinksTitle = "Мы на связи",
            SocialLinksDescription = "Добавьте официальные ссылки общины, чтобы участники могли быстро перейти в нужный канал.",
            SocialLinks = []
        };
    }

    private static SiteSocialLinksConfigModel NormalizeConfig(SiteSocialLinksConfigModel source)
    {
        return new SiteSocialLinksConfigModel
        {
            SocialLinksEnabled = source.SocialLinksEnabled,
            SocialLinksTitle = AppSettingsService.NormalizeValue(source.SocialLinksTitle) ?? "Мы на связи",
            SocialLinksDescription = AppSettingsService.NormalizeValue(source.SocialLinksDescription),
            SocialLinks = source.SocialLinks
                .Select((item, index) => NormalizeLink(item, index))
                .Where(item => !string.IsNullOrWhiteSpace(item.Url))
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray()
        };
    }

    private static SiteSocialLinkModel NormalizeLink(UpdateAdminSiteSocialLinkRequest source, int index)
    {
        return NormalizeLink(new SiteSocialLinkModel
        {
            Id = source.Id,
            Preset = source.Preset,
            Label = source.Label,
            Url = source.Url,
            Enabled = source.Enabled,
            ShowInHeader = source.ShowInHeader,
            ShowInFooter = source.ShowInFooter,
            SortOrder = source.SortOrder == default ? index : source.SortOrder
        }, index);
    }

    private static SiteSocialLinkModel NormalizeLink(SiteSocialLinkModel source, int index)
    {
        var preset = AppSettingsService.NormalizeValue(source.Preset)?.ToLowerInvariant() ?? "custom";
        if (!KnownPresets.Contains(preset))
        {
            preset = "custom";
        }

        return new SiteSocialLinkModel
        {
            Id = AppSettingsService.NormalizeValue(source.Id) ?? Guid.NewGuid().ToString("N"),
            Preset = preset,
            Label = AppSettingsService.NormalizeValue(source.Label) ?? GetDefaultLabel(preset),
            Url = AppSettingsService.NormalizeValue(source.Url) ?? string.Empty,
            Enabled = source.Enabled,
            ShowInHeader = source.ShowInHeader,
            ShowInFooter = source.ShowInFooter,
            SortOrder = source.SortOrder == default ? index : source.SortOrder
        };
    }

    private static string GetDefaultLabel(string preset)
    {
        return preset.ToLowerInvariant() switch
        {
            "telegram" => "Telegram",
            "vk" => "VK",
            "youtube" => "YouTube",
            "rutube" => "RuTube",
            "instagram" => "Instagram",
            "website" => "Сайт",
            "email" => "E-mail",
            "phone" => "Телефон",
            _ => "Ссылка"
        };
    }

    private static AdminSiteSettingsResponse MapAdmin(SiteSocialLinksConfigModel config)
    {
        return new AdminSiteSettingsResponse
        {
            SocialLinksEnabled = config.SocialLinksEnabled,
            SocialLinksTitle = config.SocialLinksTitle,
            SocialLinksDescription = config.SocialLinksDescription,
            SocialLinks = config.SocialLinks
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .Select(item => new AdminSiteSocialLinkDto
                {
                    Id = item.Id,
                    Preset = item.Preset,
                    Label = item.Label,
                    Url = item.Url,
                    Enabled = item.Enabled,
                    ShowInHeader = item.ShowInHeader,
                    ShowInFooter = item.ShowInFooter,
                    SortOrder = item.SortOrder
                })
                .ToArray()
        };
    }

    private static PublicSiteSettingsResponse MapPublic(SiteSocialLinksConfigModel config)
    {
        var enabledLinks = config.SocialLinks
            .Where(item => item.Enabled && !string.IsNullOrWhiteSpace(item.Url))
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
            .Select(item => new PublicSiteSocialLinkDto
            {
                Id = item.Id,
                Preset = item.Preset,
                Label = item.Label,
                Url = item.Url,
                ShowInHeader = item.ShowInHeader,
                ShowInFooter = item.ShowInFooter,
                SortOrder = item.SortOrder
            })
            .ToArray();

        return new PublicSiteSettingsResponse
        {
            SocialLinksEnabled = config.SocialLinksEnabled,
            SocialLinksTitle = config.SocialLinksTitle,
            SocialLinksDescription = config.SocialLinksDescription,
            SocialLinks = config.SocialLinksEnabled ? enabledLinks : Array.Empty<PublicSiteSocialLinkDto>()
        };
    }

    private sealed class SiteSocialLinksConfigModel
    {
        public bool SocialLinksEnabled { get; init; }
        public string? SocialLinksTitle { get; init; }
        public string? SocialLinksDescription { get; init; }
        public IReadOnlyCollection<SiteSocialLinkModel> SocialLinks { get; init; } = Array.Empty<SiteSocialLinkModel>();
    }

    private sealed class SiteSocialLinkModel
    {
        public string Id { get; init; } = string.Empty;
        public string Preset { get; init; } = "custom";
        public string Label { get; init; } = string.Empty;
        public string Url { get; init; } = string.Empty;
        public bool Enabled { get; init; } = true;
        public bool ShowInHeader { get; init; } = true;
        public bool ShowInFooter { get; init; } = true;
        public int SortOrder { get; init; }
    }
}
