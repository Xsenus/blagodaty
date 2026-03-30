namespace Blagodaty.Api.Contracts.Admin;

public sealed class UpdateExternalAuthProviderRequest
{
    public bool Enabled { get; init; }
    public bool? WidgetEnabled { get; init; }
    public string? ClientId { get; init; }
    public string? ClientSecret { get; init; }
    public string? BotUsername { get; init; }
    public string? BotToken { get; init; }
    public string? WebhookSecret { get; init; }
}
