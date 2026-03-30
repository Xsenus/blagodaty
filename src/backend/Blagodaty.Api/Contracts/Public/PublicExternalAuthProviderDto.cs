namespace Blagodaty.Api.Contracts.Public;

public sealed class PublicExternalAuthProviderDto
{
    public required string Provider { get; init; }
    public required string DisplayName { get; init; }
    public required string Mode { get; init; }
    public bool Enabled { get; init; }
    public bool WidgetEnabled { get; init; }
    public string? BotUsername { get; init; }
}
