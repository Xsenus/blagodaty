namespace Blagodaty.Api.Contracts.Admin;

public sealed class UpdateUserRolesRequest
{
    public IReadOnlyCollection<string> Roles { get; init; } = Array.Empty<string>();
}
