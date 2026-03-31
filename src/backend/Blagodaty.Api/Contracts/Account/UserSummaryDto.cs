namespace Blagodaty.Api.Contracts.Account;

public sealed class UserSummaryDto
{
    public required Guid Id { get; init; }
    public required string Email { get; init; }
    public required string DisplayName { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? City { get; init; }
    public string? ChurchName { get; init; }
    public string? PhoneNumber { get; init; }
    public bool PhoneNumberConfirmed { get; init; }
    public required IReadOnlyCollection<string> Roles { get; init; }
}
