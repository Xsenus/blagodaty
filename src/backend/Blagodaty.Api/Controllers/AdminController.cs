using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin")]
public sealed class AdminController : ControllerBase
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminController(AppDbContext dbContext, UserManager<ApplicationUser> userManager)
    {
        _dbContext = dbContext;
        _userManager = userManager;
    }

    [HttpGet("overview")]
    public async Task<ActionResult<AdminOverviewResponse>> GetOverview()
    {
        var totalUsersTask = _dbContext.Users.AsNoTracking().CountAsync();
        var registrationStatsTask = _dbContext.CampRegistrations
            .AsNoTracking()
            .GroupBy(_ => 1)
            .Select(group => new
            {
                TotalRegistrations = group.Count(),
                SubmittedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Submitted),
                ConfirmedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Confirmed)
            })
            .FirstOrDefaultAsync();

        var roleAssignments = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            join user in _dbContext.Users.AsNoTracking() on userRole.UserId equals user.Id
            where role.Name != null && !string.IsNullOrWhiteSpace(user.DisplayName)
            select new
            {
                RoleName = role.Name!,
                user.DisplayName
            }
        ).ToListAsync();

        await Task.WhenAll(totalUsersTask, registrationStatsTask);

        var registrationStats = registrationStatsTask.Result;
        var roleAssignmentsByName = roleAssignments
            .GroupBy(row => row.RoleName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<string>)group
                    .Select(row => row.DisplayName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray());

        return Ok(new AdminOverviewResponse
        {
            Stats = new AdminStatsDto
            {
                TotalUsers = totalUsersTask.Result,
                TotalRegistrations = registrationStats?.TotalRegistrations ?? 0,
                SubmittedRegistrations = registrationStats?.SubmittedRegistrations ?? 0,
                ConfirmedRegistrations = registrationStats?.ConfirmedRegistrations ?? 0
            },
            Roles = AppRoles.Definitions
                .Select(definition => new AdminRoleDto
                {
                    Id = definition.Name,
                    Title = definition.Title,
                    Description = definition.Description,
                    AssignedUserCount = roleAssignmentsByName.GetValueOrDefault(definition.Name, Array.Empty<string>()).Count,
                    MemberDisplayNames = roleAssignmentsByName.GetValueOrDefault(definition.Name, Array.Empty<string>())
                        .Take(6)
                        .ToArray()
                })
                .ToArray()
        });
    }

    [HttpGet("users")]
    public async Task<ActionResult<AdminPagedResponse<AdminUserDto>>> GetUsers([FromQuery] AdminUsersQueryRequest request)
    {
        var page = NormalizePage(request.Page);
        var pageSize = NormalizePageSize(request.PageSize);
        var users = ApplyUserSearch(_dbContext.Users.AsNoTracking(), request.Search);

        if (!string.IsNullOrWhiteSpace(request.Role))
        {
            var resolvedRole = AppRoles.Resolve(request.Role);
            if (resolvedRole is null)
            {
                return BadRequest(new { message = "Неизвестная роль для фильтра пользователей." });
            }

            var roleId = await _dbContext.Roles
                .AsNoTracking()
                .Where(role => role.Name == resolvedRole)
                .Select(role => (Guid?)role.Id)
                .FirstOrDefaultAsync();

            if (roleId is null)
            {
                return Ok(CreatePagedResponse(page, pageSize, 0, Array.Empty<AdminUserDto>()));
            }

            users = users.Where(user => _dbContext.UserRoles.Any(userRole => userRole.UserId == user.Id && userRole.RoleId == roleId.Value));
        }

        var totalItems = await users.CountAsync();
        var totalPages = CalculateTotalPages(totalItems, pageSize);
        page = Math.Min(page, totalPages);

        var items = await users
            .OrderByDescending(user => user.CreatedAtUtc)
            .ThenBy(user => user.DisplayName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var mappedItems = await MapAdminUsersAsync(items, orderedUserIds: items.Select(user => user.Id).ToArray());
        return Ok(CreatePagedResponse(page, pageSize, totalItems, mappedItems));
    }

    [HttpGet("registrations")]
    public async Task<ActionResult<AdminPagedResponse<AdminUserDto>>> GetRegistrations([FromQuery] AdminRegistrationsQueryRequest request)
    {
        var page = NormalizePage(request.Page);
        var pageSize = NormalizePageSize(request.PageSize);
        var registrations = ApplyRegistrationSearch(_dbContext.CampRegistrations.AsNoTracking(), request.Search);

        if (request.Status is not null)
        {
            registrations = registrations.Where(registration => registration.Status == request.Status.Value);
        }

        var totalItems = await registrations.CountAsync();
        var totalPages = CalculateTotalPages(totalItems, pageSize);
        page = Math.Min(page, totalPages);

        var pagedRegistrations = await registrations
            .OrderByDescending(registration => registration.UpdatedAtUtc)
            .ThenByDescending(registration => registration.CreatedAtUtc)
            .Select(registration => new RegistrationListItem
            {
                UserId = registration.UserId,
                Status = registration.Status,
                UpdatedAtUtc = registration.UpdatedAtUtc
            })
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var orderedUserIds = pagedRegistrations
            .Select(registration => registration.UserId)
            .ToArray();

        if (orderedUserIds.Length == 0)
        {
            return Ok(CreatePagedResponse(page, pageSize, totalItems, Array.Empty<AdminUserDto>()));
        }

        var users = await _dbContext.Users
            .AsNoTracking()
            .Where(user => orderedUserIds.Contains(user.Id))
            .ToListAsync();

        var registrationByUserId = pagedRegistrations.ToDictionary(
            registration => registration.UserId,
            registration => registration);

        var mappedItems = await MapAdminUsersAsync(users, registrationByUserId, orderedUserIds);
        return Ok(CreatePagedResponse(page, pageSize, totalItems, mappedItems));
    }

    [HttpPut("users/{userId:guid}/roles")]
    public async Task<ActionResult<AdminUserDto>> UpdateUserRoles(Guid userId, [FromBody] UpdateUserRolesRequest request)
    {
        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId);
        if (user is null)
        {
            return NotFound();
        }

        var requestedRoles = request.Roles
            .Select(AppRoles.Resolve)
            .Where(role => role is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (requestedRoles.Count == 0)
        {
            requestedRoles.Add(AppRoles.Member);
        }

        if ((requestedRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase) ||
             requestedRoles.Contains(AppRoles.CampManager, StringComparer.OrdinalIgnoreCase)) &&
            !requestedRoles.Contains(AppRoles.Member, StringComparer.OrdinalIgnoreCase))
        {
            requestedRoles.Insert(0, AppRoles.Member);
        }

        var currentRoles = (await _userManager.GetRolesAsync(user)).ToArray();
        var isRemovingAdmin = currentRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase) &&
            !requestedRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase);

        if (isRemovingAdmin)
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Admin);
            if (adminUsers.Count <= 1)
            {
                return BadRequest(new { message = "Нельзя снять роль администратора у последнего администратора системы." });
            }
        }

        var rolesToRemove = currentRoles.Except(requestedRoles, StringComparer.OrdinalIgnoreCase).ToArray();
        if (rolesToRemove.Length > 0)
        {
            var removeResult = await _userManager.RemoveFromRolesAsync(user, rolesToRemove);
            if (!removeResult.Succeeded)
            {
                return BuildIdentityProblem(removeResult);
            }
        }

        var rolesToAdd = requestedRoles.Except(currentRoles, StringComparer.OrdinalIgnoreCase).ToArray();
        if (rolesToAdd.Length > 0)
        {
            var addResult = await _userManager.AddToRolesAsync(user, rolesToAdd);
            if (!addResult.Succeeded)
            {
                return BuildIdentityProblem(addResult);
            }
        }

        var refreshedUser = await _dbContext.Users
            .AsNoTracking()
            .FirstAsync(item => item.Id == user.Id);

        var mappedUser = await MapAdminUsersAsync(
            [refreshedUser],
            orderedUserIds: [refreshedUser.Id]);

        return Ok(mappedUser.Single());
    }

    private ActionResult<AdminUserDto> BuildIdentityProblem(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }

        return ValidationProblem(ModelState);
    }

    private static int GetRoleSortOrder(string roleName)
    {
        return roleName switch
        {
            AppRoles.Member => 0,
            AppRoles.CampManager => 1,
            AppRoles.Admin => 2,
            _ => 10
        };
    }

    private IQueryable<ApplicationUser> ApplyUserSearch(IQueryable<ApplicationUser> query, string? search)
    {
        var pattern = BuildSearchPattern(search);
        if (pattern is null)
        {
            return query;
        }

        return query.Where(user =>
            EF.Functions.ILike(user.DisplayName, pattern) ||
            EF.Functions.ILike(user.FirstName, pattern) ||
            EF.Functions.ILike(user.LastName, pattern) ||
            (user.Email != null && EF.Functions.ILike(user.Email, pattern)) ||
            (user.City != null && EF.Functions.ILike(user.City, pattern)) ||
            (user.ChurchName != null && EF.Functions.ILike(user.ChurchName, pattern)));
    }

    private IQueryable<CampRegistration> ApplyRegistrationSearch(IQueryable<CampRegistration> query, string? search)
    {
        var pattern = BuildSearchPattern(search);
        if (pattern is null)
        {
            return query;
        }

        return query.Where(registration =>
            EF.Functions.ILike(registration.User.DisplayName, pattern) ||
            EF.Functions.ILike(registration.User.FirstName, pattern) ||
            EF.Functions.ILike(registration.User.LastName, pattern) ||
            (registration.User.Email != null && EF.Functions.ILike(registration.User.Email, pattern)) ||
            (registration.User.City != null && EF.Functions.ILike(registration.User.City, pattern)) ||
            (registration.User.ChurchName != null && EF.Functions.ILike(registration.User.ChurchName, pattern)));
    }

    private async Task<IReadOnlyCollection<AdminUserDto>> MapAdminUsersAsync(
        IReadOnlyCollection<ApplicationUser> users,
        IReadOnlyDictionary<Guid, RegistrationListItem>? registrationsByUserId = null,
        IReadOnlyCollection<Guid>? orderedUserIds = null)
    {
        if (users.Count == 0)
        {
            return Array.Empty<AdminUserDto>();
        }

        var userIds = users.Select(user => user.Id).ToArray();
        var userIdSet = userIds.ToHashSet();
        var usersById = users.ToDictionary(user => user.Id);
        var rolesByUserId = await GetRolesByUserIdAsync(userIds);
        var registrations = registrationsByUserId is null
            ? await GetRegistrationsByUserIdAsync(userIds)
            : registrationsByUserId;
        var externalIdentitiesByUserId = await GetExternalIdentitiesByUserIdAsync(userIds);
        var finalOrder = orderedUserIds?.Where(userIdSet.Contains).ToArray() ?? userIds;

        return finalOrder
            .Select(userId =>
            {
                var user = usersById[userId];
                registrations.TryGetValue(userId, out var registration);

                return new AdminUserDto
                {
                    Id = user.Id,
                    Email = TechnicalEmailHelper.ToVisibleEmail(user.Email),
                    DisplayName = user.DisplayName,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    City = user.City,
                    ChurchName = user.ChurchName,
                    PhoneNumber = user.PhoneNumber,
                    Roles = rolesByUserId.GetValueOrDefault(user.Id, Array.Empty<string>()),
                    CreatedAtUtc = user.CreatedAtUtc,
                    LastLoginAtUtc = user.LastLoginAtUtc,
                    RegistrationStatus = registration?.Status,
                    RegistrationUpdatedAtUtc = registration?.UpdatedAtUtc,
                    ExternalIdentities = externalIdentitiesByUserId.GetValueOrDefault(
                        user.Id,
                        Array.Empty<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>())
                };
            })
            .ToArray();
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<string>>> GetRolesByUserIdAsync(IReadOnlyCollection<Guid> userIds)
    {
        var roleRows = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where userIds.Contains(userRole.UserId) && role.Name != null
            select new { userRole.UserId, RoleName = role.Name! }
        ).ToListAsync();

        return roleRows
            .GroupBy(row => row.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<string>)group
                    .Select(row => row.RoleName)
                    .OrderBy(GetRoleSortOrder)
                    .ThenBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray());
    }

    private async Task<Dictionary<Guid, RegistrationListItem>> GetRegistrationsByUserIdAsync(IReadOnlyCollection<Guid> userIds)
    {
        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration => userIds.Contains(registration.UserId))
            .Select(registration => new RegistrationListItem
            {
                UserId = registration.UserId,
                Status = registration.Status,
                UpdatedAtUtc = registration.UpdatedAtUtc
            })
            .ToListAsync();

        return registrations.ToDictionary(registration => registration.UserId);
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>>> GetExternalIdentitiesByUserIdAsync(IReadOnlyCollection<Guid> userIds)
    {
        var externalIdentities = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(identity => userIds.Contains(identity.UserId))
            .OrderBy(identity => identity.Provider)
            .ToListAsync();

        return externalIdentities
            .GroupBy(identity => identity.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>)group
                    .Select(AccountMapper.ToExternalIdentity)
                    .ToArray());
    }

    private static AdminPagedResponse<AdminUserDto> CreatePagedResponse(
        int page,
        int pageSize,
        int totalItems,
        IReadOnlyCollection<AdminUserDto> items)
    {
        var totalPages = CalculateTotalPages(totalItems, pageSize);

        return new AdminPagedResponse<AdminUserDto>
        {
            Items = items,
            Page = Math.Min(NormalizePage(page), totalPages),
            PageSize = pageSize,
            TotalItems = totalItems,
            TotalPages = totalPages
        };
    }

    private static string? BuildSearchPattern(string? search)
    {
        var normalized = search?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : $"%{normalized}%";
    }

    private static int NormalizePage(int page)
    {
        return page < 1 ? 1 : page;
    }

    private static int NormalizePageSize(int pageSize)
    {
        if (pageSize <= 0)
        {
            return DefaultPageSize;
        }

        return Math.Clamp(pageSize, 1, MaxPageSize);
    }

    private static int CalculateTotalPages(int totalItems, int pageSize)
    {
        return Math.Max(1, (int)Math.Ceiling(totalItems / (double)pageSize));
    }

    private sealed class RegistrationListItem
    {
        public required Guid UserId { get; init; }
        public required RegistrationStatus Status { get; init; }
        public required DateTime UpdatedAtUtc { get; init; }
    }
}
