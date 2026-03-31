namespace Blagodaty.Api.Contracts.Public;

public sealed class PublicSiteSettingsResponse
{
    public required bool SocialLinksEnabled { get; init; }
    public string? SocialLinksTitle { get; init; }
    public string? SocialLinksDescription { get; init; }
    public required IReadOnlyCollection<PublicSiteSocialLinkDto> SocialLinks { get; init; }
}

public sealed class PublicSiteSocialLinkDto
{
    public required string Id { get; init; }
    public required string Preset { get; init; }
    public required string Label { get; init; }
    public required string Url { get; init; }
    public required bool ShowInHeader { get; init; }
    public required bool ShowInFooter { get; init; }
    public required int SortOrder { get; init; }
}
