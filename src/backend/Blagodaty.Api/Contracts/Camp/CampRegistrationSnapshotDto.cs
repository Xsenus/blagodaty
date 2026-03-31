using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Camp;

public sealed class CampRegistrationSnapshotDto
{
    public required Guid Id { get; init; }
    public Guid? EventEditionId { get; init; }
    public string? EventSlug { get; init; }
    public required RegistrationStatus Status { get; init; }
    public int ParticipantsCount { get; init; }
    public required DateTime UpdatedAtUtc { get; init; }
    public DateTime? SubmittedAtUtc { get; init; }
}
