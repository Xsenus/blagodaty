using Blagodaty.Api.Contracts.Camp;

namespace Blagodaty.Api.Contracts.Account;

public sealed class CurrentAccountResponse
{
    public required UserSummaryDto User { get; init; }
    public CampRegistrationSnapshotDto? Registration { get; init; }
}
