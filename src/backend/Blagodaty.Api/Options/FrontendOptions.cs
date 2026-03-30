namespace Blagodaty.Api.Options;

public sealed class FrontendOptions
{
    public const string SectionName = "Frontend";

    public string CampUrl { get; set; } = string.Empty;
    public string CabinetUrl { get; set; } = string.Empty;
    public string[] AdditionalOrigins { get; set; } = [];
}
