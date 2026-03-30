namespace Blagodaty.Api.Options;

public sealed class SeedOptions
{
    public const string SectionName = "Seed";

    public string AdminEmail { get; set; } = string.Empty;
    public string AdminPassword { get; set; } = string.Empty;
    public string AdminDisplayName { get; set; } = "Blagodaty Admin";
}
