using System.Security.Claims;
using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Services;
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
    private readonly ExternalIdentityService _externalIdentityService;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly EventCatalogService _eventCatalogService;

    public AccountController(
        UserManager<ApplicationUser> userManager,
        AppDbContext dbContext,
        ExternalIdentityService externalIdentityService,
        ExternalAuthProviderService externalAuthProviderService,
        EventCatalogService eventCatalogService)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _externalIdentityService = externalIdentityService;
        _externalAuthProviderService = externalAuthProviderService;
        _eventCatalogService = eventCatalogService;
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
        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var registration = activeCampEditionId is null
            ? null
            : await _dbContext.CampRegistrations
                .AsNoTracking()
                .Include(item => item.EventEdition)
                .FirstOrDefaultAsync(x => x.UserId == user.Id && x.EventEditionId == activeCampEditionId, HttpContext.RequestAborted);
        var identities = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(identity => identity.UserId == user.Id)
            .OrderBy(identity => identity.Provider)
            .ToListAsync();

        return Ok(new CurrentAccountResponse
        {
            User = AccountMapper.ToUserSummary(user, roles),
            Registration = registration is null
                ? null
                : new CampRegistrationSnapshotDto
                {
                    Id = registration.Id,
                    EventEditionId = registration.EventEditionId,
                    EventSlug = registration.EventEdition?.Slug,
                    Status = registration.Status,
                    UpdatedAtUtc = registration.UpdatedAtUtc,
                    SubmittedAtUtc = registration.SubmittedAtUtc
                },
            ExternalIdentities = identities.Select(AccountMapper.ToExternalIdentity).ToArray(),
            AvailableExternalAuthProviders = await _externalAuthProviderService.GetPublicProvidersAsync(HttpContext.RequestAborted),
            HasPassword = !string.IsNullOrWhiteSpace(user.PasswordHash)
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
        return Ok(AccountMapper.ToUserSummary(user, roles));
    }

    [HttpDelete("external/{provider}")]
    public async Task<ActionResult<IReadOnlyCollection<ExternalIdentityDto>>> UnlinkExternalIdentity([FromRoute] string provider)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        try
        {
            var removed = await _externalIdentityService.DetachExternalIdentityAsync(user.Id, provider, HttpContext.RequestAborted);
            if (!removed)
            {
                return NotFound();
            }

            var identities = await _dbContext.UserExternalIdentities
                .AsNoTracking()
                .Where(identity => identity.UserId == user.Id)
                .OrderBy(identity => identity.Provider)
                .ToListAsync();

            return Ok(identities.Select(AccountMapper.ToExternalIdentity).ToArray());
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
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
