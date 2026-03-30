namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminExternalAuthSettingsResponse
{
    public required IReadOnlyCollection<AdminExternalAuthProviderDto> Providers { get; init; }
    public required IReadOnlyCollection<AdminExternalAuthEventDto> RecentEvents { get; init; }
}
