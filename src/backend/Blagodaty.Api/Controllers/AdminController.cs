using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
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
        var users = await _dbContext.Users
            .AsNoTracking()
            .OrderBy(user => user.CreatedAtUtc)
            .ToListAsync();

        var roleRows = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where role.Name != null
            select new { userRole.UserId, RoleName = role.Name! }
        ).ToListAsync();

        var rolesByUserId = roleRows
            .GroupBy(row => row.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<string>)group
                    .Select(row => row.RoleName)
                    .OrderBy(GetRoleSortOrder)
                    .ThenBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray());

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Select(registration => new
            {
                registration.UserId,
                registration.Status,
                registration.UpdatedAtUtc
            })
            .ToListAsync();

        var registrationsByUserId = registrations.ToDictionary(
            registration => registration.UserId,
            registration => registration);

        return Ok(new AdminOverviewResponse
        {
            Stats = new AdminStatsDto
            {
                TotalUsers = users.Count,
                TotalRegistrations = registrations.Count,
                SubmittedRegistrations = registrations.Count(registration => registration.Status == RegistrationStatus.Submitted),
                ConfirmedRegistrations = registrations.Count(registration => registration.Status == RegistrationStatus.Confirmed)
            },
            Roles = AppRoles.Definitions
                .Select(definition => new AdminRoleDto
                {
                    Id = definition.Name,
                    Title = definition.Title,
                    Description = definition.Description
                })
                .ToArray(),
            Users = users
                .Select(user =>
                {
                    registrationsByUserId.TryGetValue(user.Id, out var registration);

                    return new AdminUserDto
                    {
                        Id = user.Id,
                        Email = user.Email ?? string.Empty,
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
                        RegistrationUpdatedAtUtc = registration?.UpdatedAtUtc
                    };
                })
                .ToArray()
        });
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

        var registration = await _dbContext.CampRegistrations
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.UserId == user.Id);

        var updatedRoles = (await _userManager.GetRolesAsync(user))
            .OrderBy(GetRoleSortOrder)
            .ThenBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return Ok(new AdminUserDto
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            DisplayName = user.DisplayName,
            FirstName = user.FirstName,
            LastName = user.LastName,
            City = user.City,
            ChurchName = user.ChurchName,
            PhoneNumber = user.PhoneNumber,
            Roles = updatedRoles,
            CreatedAtUtc = user.CreatedAtUtc,
            LastLoginAtUtc = user.LastLoginAtUtc,
            RegistrationStatus = registration?.Status,
            RegistrationUpdatedAtUtc = registration?.UpdatedAtUtc
        });
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
}
