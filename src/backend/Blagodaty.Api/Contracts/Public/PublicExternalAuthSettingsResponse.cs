namespace Blagodaty.Api.Contracts.Public;

public sealed class PublicExternalAuthSettingsResponse
{
    public required IReadOnlyCollection<PublicExternalAuthProviderDto> Providers { get; init; }
}
