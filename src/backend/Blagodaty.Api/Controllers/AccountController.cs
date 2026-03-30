using System.Security.Claims;
using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/account")]
public sealed class AccountController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly AppDbContext _dbContext;

    public AccountController(UserManager<ApplicationUser> userManager, AppDbContext dbContext)
    {
        _userManager = userManager;
        _dbContext = dbContext;
    }

    [HttpGet("me")]
    public async Task<ActionResult<CurrentAccountResponse>> GetCurrentAccount()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var roles = (await _userManager.GetRolesAsync(user)).ToArray();
        var registration = await _dbContext.CampRegistrations.FirstOrDefaultAsync(x => x.UserId == user.Id);

        return Ok(new CurrentAccountResponse
        {
            User = new UserSummaryDto
            {
                Id = user.Id,
                Email = user.Email ?? string.Empty,
                DisplayName = user.DisplayName,
                FirstName = user.FirstName,
                LastName = user.LastName,
                City = user.City,
                ChurchName = user.ChurchName,
                PhoneNumber = user.PhoneNumber,
                Roles = roles
            },
            Registration = registration is null
                ? null
                : new CampRegistrationSnapshotDto
                {
                    Id = registration.Id,
                    Status = registration.Status,
                    UpdatedAtUtc = registration.UpdatedAtUtc,
                    SubmittedAtUtc = registration.SubmittedAtUtc
                }
        });
    }

    [HttpPut("profile")]
    public async Task<ActionResult<UserSummaryDto>> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        user.FirstName = request.FirstName.Trim();
        user.LastName = request.LastName.Trim();
        user.DisplayName = request.DisplayName.Trim();
        user.PhoneNumber = request.PhoneNumber?.Trim();
        user.City = request.City?.Trim();
        user.ChurchName = request.ChurchName?.Trim();

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            foreach (var error in result.Errors)
            {
                ModelState.AddModelError(error.Code, error.Description);
            }

            return ValidationProblem(ModelState);
        }

        var roles = (await _userManager.GetRolesAsync(user)).ToArray();

        return Ok(new UserSummaryDto
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            DisplayName = user.DisplayName,
            FirstName = user.FirstName,
            LastName = user.LastName,
            City = user.City,
            ChurchName = user.ChurchName,
            PhoneNumber = user.PhoneNumber,
            Roles = roles
        });
    }

    private async Task<ApplicationUser?> GetCurrentUserAsync()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await _userManager.Users.FirstOrDefaultAsync(x => x.Id == userId);
    }
}
