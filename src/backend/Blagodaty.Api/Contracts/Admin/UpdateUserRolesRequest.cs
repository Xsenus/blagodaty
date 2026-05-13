namespace Blagodaty.Api.Contracts.Admin;

public sealed class UpdateUserRolesRequest
{
    public IReadOnlyCollection<string> Roles { get; init; } = Array.Empty<string>();
}

public sealed class UpdateAdminUserRequest
{
    public string? FirstName { get; init; }
    public string? LastName { get; init; }
    public string? Patronymic { get; init; }
    public string? DisplayName { get; init; }
    public string? PhoneNumber { get; init; }
    public string? City { get; init; }
    public string? ChurchName { get; init; }
}

public sealed class LinkRegistrationToUserRequest
{
    public Guid UserId { get; init; }
}

public sealed class MergeUsersRequest
{
    public Guid TargetUserId { get; init; }
}
