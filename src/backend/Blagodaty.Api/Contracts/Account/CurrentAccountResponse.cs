using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Contracts.Public;

namespace Blagodaty.Api.Contracts.Account;

public sealed class CurrentAccountResponse
{
    public required UserSummaryDto User { get; init; }
    public CampRegistrationSnapshotDto? Registration { get; init; }
    public required IReadOnlyCollection<ExternalIdentityDto> ExternalIdentities { get; init; }
    public required IReadOnlyCollection<PublicExternalAuthProviderDto> AvailableExternalAuthProviders { get; init; }
    public bool HasPassword { get; init; }
}
