using Blagodaty.Api.Models;

namespace Blagodaty.Api.Contracts.Admin;

public sealed class AdminPagedResponse<T>
{
    public required IReadOnlyCollection<T> Items { get; init; }
    public required int Page { get; init; }
    public required int PageSize { get; init; }
    public required int TotalItems { get; init; }
    public required int TotalPages { get; init; }
}

public sealed class AdminUsersQueryRequest
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public string? Search { get; init; }
    public string? Role { get; init; }
}

public sealed class AdminRegistrationsQueryRequest
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public string? Search { get; init; }
    public RegistrationStatus? Status { get; init; }
}
