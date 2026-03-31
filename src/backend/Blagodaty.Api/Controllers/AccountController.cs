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
    private readonly EventRegistrationService _eventRegistrationService;
    private readonly UserNotificationService _userNotificationService;

    public AccountController(
        UserManager<ApplicationUser> userManager,
        AppDbContext dbContext,
        ExternalIdentityService externalIdentityService,
        ExternalAuthProviderService externalAuthProviderService,
        EventCatalogService eventCatalogService,
        EventRegistrationService eventRegistrationService,
        UserNotificationService userNotificationService)
    {
        _userManager = userManager;
        _dbContext = dbContext;
        _externalIdentityService = externalIdentityService;
        _externalAuthProviderService = externalAuthProviderService;
        _eventCatalogService = eventCatalogService;
        _eventRegistrationService = eventRegistrationService;
        _userNotificationService = userNotificationService;
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
        var registrations = await _eventRegistrationService.GetUserRegistrationsAsync(user.Id, HttpContext.RequestAborted);
        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var registration = activeCampEditionId is null
            ? null
            : registrations.FirstOrDefault(item => item.EventEditionId == activeCampEditionId);
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
                    EventSlug = registration.EventSlug,
                    Status = registration.Status,
                    ParticipantsCount = registration.ParticipantsCount,
                    UpdatedAtUtc = registration.UpdatedAtUtc,
                    SubmittedAtUtc = registration.SubmittedAtUtc
                },
            Registrations = registrations,
            ExternalIdentities = identities.Select(AccountMapper.ToExternalIdentity).ToArray(),
            AvailableExternalAuthProviders = await _externalAuthProviderService.GetPublicProvidersAsync(HttpContext.RequestAborted),
            UnreadNotificationsCount = await _userNotificationService.GetUnreadCountAsync(user.Id, HttpContext.RequestAborted),
            HasPassword = !string.IsNullOrWhiteSpace(user.PasswordHash)
        });
    }

    [HttpGet("registrations")]
    public async Task<ActionResult<IReadOnlyCollection<AccountRegistrationSummaryDto>>> GetRegistrations()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(await _eventRegistrationService.GetUserRegistrationsAsync(user.Id, HttpContext.RequestAborted));
    }

    [HttpGet("notifications")]
    public async Task<ActionResult<AccountNotificationsResponse>> GetNotifications([FromQuery] AccountNotificationsQueryRequest request)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        return Ok(await _userNotificationService.GetNotificationsAsync(
            user.Id,
            request.Page,
            request.PageSize,
            request.UnreadOnly,
            HttpContext.RequestAborted));
    }

    [HttpPost("notifications/{notificationId:guid}/read")]
    public async Task<IActionResult> MarkNotificationAsRead(Guid notificationId)
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var marked = await _userNotificationService.MarkAsReadAsync(user.Id, notificationId, HttpContext.RequestAborted);
        return marked ? NoContent() : NotFound();
    }

    [HttpPost("notifications/read-all")]
    public async Task<ActionResult<object>> MarkAllNotificationsAsRead()
    {
        var user = await GetCurrentUserAsync();
        if (user is null)
        {
            return Unauthorized();
        }

        var markedCount = await _userNotificationService.MarkAllAsReadAsync(user.Id, HttpContext.RequestAborted);
        return Ok(new { markedCount });
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
        var nextPhoneNumber = request.PhoneNumber?.Trim();
        if (!string.Equals(user.PhoneNumber, nextPhoneNumber, StringComparison.Ordinal))
        {
            user.PhoneNumberConfirmed = false;
        }

        user.PhoneNumber = nextPhoneNumber;
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
