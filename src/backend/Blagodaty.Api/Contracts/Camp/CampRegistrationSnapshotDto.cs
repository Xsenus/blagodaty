using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Camp;

public sealed class CampRegistrationSnapshotDto
{
    public required Guid Id { get; init; }
    public required RegistrationStatus Status { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
    public DateTime? SubmittedAtUtc { get; init; }
}
