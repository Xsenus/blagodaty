namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminExternalAuthProviderDto
{
    public required string Provider { get; init; }
    public required string DisplayName { get; init; }
    public required string Mode { get; init; }
    public bool Enabled { get; init; }
    public bool Ready { get; init; }
    public bool WidgetEnabled { get; init; }
    public string? ClientId { get; init; }
    public string? ClientSecretMasked { get; init; }
    public string? BotUsername { get; init; }
    public string? BotTokenMasked { get; init; }
    public string? CallbackUrl { get; init; }
    public string? WebhookUrl { get; init; }
    public string? WebhookSecretMasked { get; init; }
    public required IReadOnlyCollection<string> Hints { get; init; }
    public required IReadOnlyCollection<AdminExternalAuthDiagnosticDto> Diagnostics { get; init; }
}
