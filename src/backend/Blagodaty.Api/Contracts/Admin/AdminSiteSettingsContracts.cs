using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminSiteSettingsResponse
{
    public required bool SocialLinksEnabled { get; init; }
    public string? SocialLinksTitle { get; init; }
    public string? SocialLinksDescription { get; init; }
    public required IReadOnlyCollection<AdminSiteSocialLinkDto> SocialLinks { get; init; }
    public required bool ContactsEnabled { get; init; }
    public string? ContactsTitle { get; init; }
    public string? ContactsDescription { get; init; }
    public required IReadOnlyCollection<AdminSiteContactPersonDto> ContactPeople { get; init; }
}

public sealed class AdminSiteSocialLinkDto
{
    public required string Id { get; init; }
    public required string Preset { get; init; }
    public required string Label { get; init; }
    public required string Url { get; init; }
    public required bool Enabled { get; init; }
    public required bool ShowInHeader { get; init; }
    public required bool ShowInFooter { get; init; }
    public required int SortOrder { get; init; }
}

public sealed class UpdateAdminSiteSettingsRequest
{
    public bool SocialLinksEnabled { get; init; }

    [MaxLength(180)]
    public string? SocialLinksTitle { get; init; }

    [MaxLength(1000)]
    public string? SocialLinksDescription { get; init; }

    public IReadOnlyCollection<UpdateAdminSiteSocialLinkRequest> SocialLinks { get; init; } = Array.Empty<UpdateAdminSiteSocialLinkRequest>();
    public bool ContactsEnabled { get; init; }

    [MaxLength(180)]
    public string? ContactsTitle { get; init; }

    [MaxLength(1000)]
    public string? ContactsDescription { get; init; }

    public IReadOnlyCollection<UpdateAdminSiteContactPersonRequest> ContactPeople { get; init; } = Array.Empty<UpdateAdminSiteContactPersonRequest>();
}

public sealed class UpdateAdminSiteSocialLinkRequest
{
    [Required, MaxLength(80)]
    public string Id { get; init; } = string.Empty;

    [Required, MaxLength(32)]
    public string Preset { get; init; } = "custom";

    [Required, MaxLength(80)]
    public string Label { get; init; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Url { get; init; } = string.Empty;

    public bool Enabled { get; init; } = true;
    public bool ShowInHeader { get; init; } = true;
    public bool ShowInFooter { get; init; } = true;
    public int SortOrder { get; init; }
}

public sealed class AdminSiteContactPersonDto
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string Role { get; init; }
    public string? Description { get; init; }
    public required bool Enabled { get; init; }
    public required bool ShowInFooter { get; init; }
    public required int SortOrder { get; init; }
    public required IReadOnlyCollection<AdminSiteContactLinkDto> Links { get; init; }
}

public sealed class AdminSiteContactLinkDto
{
    public required string Id { get; init; }
    public required string Preset { get; init; }
    public required string Label { get; init; }
    public required string Url { get; init; }
    public required int SortOrder { get; init; }
}

public sealed class UpdateAdminSiteContactPersonRequest
{
    [Required, MaxLength(80)]
    public string Id { get; init; } = string.Empty;

    [Required, MaxLength(120)]
    public string Name { get; init; } = string.Empty;

    [MaxLength(180)]
    public string? Role { get; init; }

    [MaxLength(1000)]
    public string? Description { get; init; }

    public bool Enabled { get; init; } = true;
    public bool ShowInFooter { get; init; } = true;
    public int SortOrder { get; init; }
    public IReadOnlyCollection<UpdateAdminSiteContactLinkRequest> Links { get; init; } = Array.Empty<UpdateAdminSiteContactLinkRequest>();
}

public sealed class UpdateAdminSiteContactLinkRequest
{
    [Required, MaxLength(80)]
    public string Id { get; init; } = string.Empty;

    [Required, MaxLength(32)]
    public string Preset { get; init; } = "custom";

    [Required, MaxLength(80)]
    public string Label { get; init; } = string.Empty;

    [Required, MaxLength(1000)]
    public string Url { get; init; } = string.Empty;

    public int SortOrder { get; init; }
}
