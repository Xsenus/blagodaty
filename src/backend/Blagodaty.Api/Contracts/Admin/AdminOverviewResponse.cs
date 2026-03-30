using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminOverviewResponse
{
    public required AdminStatsDto Stats { get; init; }
    public required IReadOnlyCollection<AdminRoleDto> Roles { get; init; }
    public required IReadOnlyCollection<AdminUserDto> Users { get; init; }
}

public sealed class AdminStatsDto
{
    public required int TotalUsers { get; init; }
    public required int TotalRegistrations { get; init; }
    public required int SubmittedRegistrations { get; init; }
    public required int ConfirmedRegistrations { get; init; }
}

public sealed class AdminRoleDto
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public required string Description { get; init; }
}

public sealed class AdminUserDto
{
    public required Guid Id { get; init; }
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? City { get; init; }
    public string? ChurchName { get; init; }
    public string? PhoneNumber { get; init; }
    public required IReadOnlyCollection<string> Roles { get; init; }
    public DateTime CreatedAtUtc { get; init; }
    public DateTime? LastLoginAtUtc { get; init; }
    public RegistrationStatus? RegistrationStatus { get; init; }
    public DateTime? RegistrationUpdatedAtUtc { get; init; }
}
