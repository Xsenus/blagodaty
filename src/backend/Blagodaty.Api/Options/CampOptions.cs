namespace Blagodaty.Api.Options;

public sealed class CampOptions
{
    public const string SectionName = "Camp";

    public string Name { get; set; } = "Blagodaty Camp";
    public string Season { get; set; } = "Лето 2026";
    public string Tagline { get; set; } = string.Empty;
    public string Location { get; set; } = string.Empty;
    public decimal SuggestedDonation { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
}
