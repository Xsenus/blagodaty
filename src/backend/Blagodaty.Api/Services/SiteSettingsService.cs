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
                .ToArray(),
            ContactsEnabled = request.ContactsEnabled,
            ContactsTitle = AppSettingsService.NormalizeValue(request.ContactsTitle) ?? "Контакты",
            ContactsDescription = AppSettingsService.NormalizeValue(request.ContactsDescription),
            ContactPeople = request.ContactPeople
                .Select((item, index) => NormalizeContactPerson(item, index))
                .Where(item => item.Links.Count > 0)
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
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
            SocialLinks = [],
            ContactsEnabled = true,
            ContactsTitle = "Контакты",
            ContactsDescription = "По организационным вопросам и оплате участия.",
            ContactPeople = CreateDefaultContactPeople()
        };
    }

    private static SiteSocialLinksConfigModel NormalizeConfig(SiteSocialLinksConfigModel source)
    {
        var contactsMissing = source.ContactPeople is null;

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
                .ToArray(),
            ContactsEnabled = source.ContactsEnabled ?? contactsMissing,
            ContactsTitle = AppSettingsService.NormalizeValue(source.ContactsTitle) ?? "Контакты",
            ContactsDescription = AppSettingsService.NormalizeValue(source.ContactsDescription),
            ContactPeople = (contactsMissing ? CreateDefaultContactPeople() : source.ContactPeople!)
                .Select((item, index) => NormalizeContactPerson(item, index))
                .Where(item => item.Links.Count > 0)
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
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

    private static SiteContactPersonModel NormalizeContactPerson(UpdateAdminSiteContactPersonRequest source, int index)
    {
        return NormalizeContactPerson(new SiteContactPersonModel
        {
            Id = source.Id,
            Name = source.Name,
            Role = source.Role ?? string.Empty,
            Description = source.Description,
            Enabled = source.Enabled,
            ShowInFooter = source.ShowInFooter,
            SortOrder = source.SortOrder == default ? index : source.SortOrder,
            Links = source.Links
                .Select((item, linkIndex) => NormalizeContactLink(item, linkIndex))
                .Where(item => !string.IsNullOrWhiteSpace(item.Url))
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray()
        }, index);
    }

    private static SiteContactPersonModel NormalizeContactPerson(SiteContactPersonModel source, int index)
    {
        return new SiteContactPersonModel
        {
            Id = AppSettingsService.NormalizeValue(source.Id) ?? Guid.NewGuid().ToString("N"),
            Name = AppSettingsService.NormalizeValue(source.Name) ?? "Контакт",
            Role = AppSettingsService.NormalizeValue(source.Role) ?? "Ответственный",
            Description = AppSettingsService.NormalizeValue(source.Description),
            Enabled = source.Enabled,
            ShowInFooter = source.ShowInFooter,
            SortOrder = source.SortOrder == default ? index : source.SortOrder,
            Links = source.Links
                .Select((item, linkIndex) => NormalizeContactLink(item, linkIndex))
                .Where(item => !string.IsNullOrWhiteSpace(item.Url))
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Label, StringComparer.OrdinalIgnoreCase)
                .ToArray()
        };
    }

    private static SiteContactLinkModel NormalizeContactLink(UpdateAdminSiteContactLinkRequest source, int index)
    {
        return NormalizeContactLink(new SiteContactLinkModel
        {
            Id = source.Id,
            Preset = source.Preset,
            Label = source.Label,
            Url = source.Url,
            SortOrder = source.SortOrder == default ? index : source.SortOrder
        }, index);
    }

    private static SiteContactLinkModel NormalizeContactLink(SiteContactLinkModel source, int index)
    {
        var preset = AppSettingsService.NormalizeValue(source.Preset)?.ToLowerInvariant() ?? "custom";
        if (!KnownPresets.Contains(preset))
        {
            preset = "custom";
        }

        return new SiteContactLinkModel
        {
            Id = AppSettingsService.NormalizeValue(source.Id) ?? Guid.NewGuid().ToString("N"),
            Preset = preset,
            Label = AppSettingsService.NormalizeValue(source.Label) ?? GetDefaultLabel(preset),
            Url = AppSettingsService.NormalizeValue(source.Url) ?? string.Empty,
            SortOrder = source.SortOrder == default ? index : source.SortOrder
        };
    }

    private static IReadOnlyCollection<SiteContactPersonModel> CreateDefaultContactPeople()
    {
        return
        [
            new SiteContactPersonModel
            {
                Id = "organizer-mikhail",
                Name = "Михаил",
                Role = "Организационные вопросы",
                Enabled = true,
                ShowInFooter = true,
                SortOrder = 0,
                Links =
                [
                    new SiteContactLinkModel
                    {
                        Id = "mikhail-telegram",
                        Preset = "telegram",
                        Label = "Telegram",
                        Url = "https://t.me/Michail_Max",
                        SortOrder = 0
                    },
                    new SiteContactLinkModel
                    {
                        Id = "mikhail-phone",
                        Preset = "phone",
                        Label = "Телефон",
                        Url = "tel:+79043022939",
                        SortOrder = 1
                    }
                ]
            },
            new SiteContactPersonModel
            {
                Id = "payments-ilya",
                Name = "Илья",
                Role = "Оплата участия",
                Enabled = true,
                ShowInFooter = true,
                SortOrder = 1,
                Links =
                [
                    new SiteContactLinkModel
                    {
                        Id = "ilya-telegram",
                        Preset = "telegram",
                        Label = "Telegram",
                        Url = "https://t.me/Xsenus",
                        SortOrder = 0
                    },
                    new SiteContactLinkModel
                    {
                        Id = "ilya-phone",
                        Preset = "phone",
                        Label = "Телефон",
                        Url = "tel:+79130149349",
                        SortOrder = 1
                    }
                ]
            }
        ];
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
                .ToArray(),
            ContactsEnabled = config.ContactsEnabled == true,
            ContactsTitle = config.ContactsTitle,
            ContactsDescription = config.ContactsDescription,
            ContactPeople = (config.ContactPeople ?? Array.Empty<SiteContactPersonModel>())
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
                .Select(item => new AdminSiteContactPersonDto
                {
                    Id = item.Id,
                    Name = item.Name,
                    Role = item.Role,
                    Description = item.Description,
                    Enabled = item.Enabled,
                    ShowInFooter = item.ShowInFooter,
                    SortOrder = item.SortOrder,
                    Links = item.Links
                        .OrderBy(link => link.SortOrder)
                        .ThenBy(link => link.Label, StringComparer.OrdinalIgnoreCase)
                        .Select(link => new AdminSiteContactLinkDto
                        {
                            Id = link.Id,
                            Preset = link.Preset,
                            Label = link.Label,
                            Url = link.Url,
                            SortOrder = link.SortOrder
                        })
                        .ToArray()
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

        var enabledContacts = (config.ContactPeople ?? Array.Empty<SiteContactPersonModel>())
            .Where(item => item.Enabled && item.ShowInFooter && item.Links.Count > 0)
            .OrderBy(item => item.SortOrder)
            .ThenBy(item => item.Name, StringComparer.OrdinalIgnoreCase)
            .Select(item => new PublicSiteContactPersonDto
            {
                Id = item.Id,
                Name = item.Name,
                Role = item.Role,
                Description = item.Description,
                ShowInFooter = item.ShowInFooter,
                SortOrder = item.SortOrder,
                Links = item.Links
                    .Where(link => !string.IsNullOrWhiteSpace(link.Url))
                    .OrderBy(link => link.SortOrder)
                    .ThenBy(link => link.Label, StringComparer.OrdinalIgnoreCase)
                    .Select(link => new PublicSiteContactLinkDto
                    {
                        Id = link.Id,
                        Preset = link.Preset,
                        Label = link.Label,
                        Url = link.Url,
                        SortOrder = link.SortOrder
                    })
                    .ToArray()
            })
            .ToArray();

        return new PublicSiteSettingsResponse
        {
            SocialLinksEnabled = config.SocialLinksEnabled,
            SocialLinksTitle = config.SocialLinksTitle,
            SocialLinksDescription = config.SocialLinksDescription,
            SocialLinks = config.SocialLinksEnabled ? enabledLinks : Array.Empty<PublicSiteSocialLinkDto>(),
            ContactsEnabled = config.ContactsEnabled == true,
            ContactsTitle = config.ContactsTitle,
            ContactsDescription = config.ContactsDescription,
            ContactPeople = config.ContactsEnabled == true ? enabledContacts : Array.Empty<PublicSiteContactPersonDto>()
        };
    }

    private sealed class SiteSocialLinksConfigModel
    {
        public bool SocialLinksEnabled { get; init; }
        public string? SocialLinksTitle { get; init; }
        public string? SocialLinksDescription { get; init; }
        public IReadOnlyCollection<SiteSocialLinkModel> SocialLinks { get; init; } = Array.Empty<SiteSocialLinkModel>();
        public bool? ContactsEnabled { get; init; }
        public string? ContactsTitle { get; init; }
        public string? ContactsDescription { get; init; }
        public IReadOnlyCollection<SiteContactPersonModel>? ContactPeople { get; init; }
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

    private sealed class SiteContactPersonModel
    {
        public string Id { get; init; } = string.Empty;
        public string Name { get; init; } = string.Empty;
        public string Role { get; init; } = string.Empty;
        public string? Description { get; init; }
        public bool Enabled { get; init; } = true;
        public bool ShowInFooter { get; init; } = true;
        public int SortOrder { get; init; }
        public IReadOnlyCollection<SiteContactLinkModel> Links { get; init; } = Array.Empty<SiteContactLinkModel>();
    }

    private sealed class SiteContactLinkModel
    {
        public string Id { get; init; } = string.Empty;
        public string Preset { get; init; } = "custom";
        public string Label { get; init; } = string.Empty;
        public string Url { get; init; } = string.Empty;
        public int SortOrder { get; init; }
    }
}
