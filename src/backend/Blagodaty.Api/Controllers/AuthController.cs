using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Auth;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly JwtTokenService _jwtTokenService;
    private readonly TimeProvider _timeProvider;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        JwtTokenService jwtTokenService,
        TimeProvider timeProvider)
    {
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _timeProvider = timeProvider;
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Register([FromBody] RegisterRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var existing = await _userManager.FindByEmailAsync(request.Email);
        if (existing is not null)
        {
            ModelState.AddModelError(nameof(request.Email), "A user with this email already exists.");
            return ValidationProblem(ModelState);
        }

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = request.Email,
            Email = request.Email,
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
                ? $"{request.FirstName.Trim()} {request.LastName.Trim()}".Trim()
                : request.DisplayName.Trim(),
            EmailConfirmed = true,
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            AddIdentityErrors(createResult);
            return ValidationProblem(ModelState);
        }

        await _userManager.AddToRoleAsync(user, AppRoles.Member);

        return Ok(await BuildAuthResponseAsync(user));
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Login([FromBody] LoginRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(x => x.Email == request.Email);
        if (user is null)
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        var signInResult = await _signInManager.CheckPasswordSignInAsync(user, request.Password, lockoutOnFailure: false);
        if (!signInResult.Succeeded)
        {
            return Unauthorized(new { message = "Invalid email or password." });
        }

        user.LastLoginAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
        await _userManager.UpdateAsync(user);

        return Ok(await BuildAuthResponseAsync(user));
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> Refresh([FromBody] RefreshRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var tokenHash = _jwtTokenService.HashRefreshToken(request.RefreshToken);
        var session = await _userManager.Users
            .SelectMany(user => user.RefreshSessions)
            .Include(refresh => refresh.User)
            .FirstOrDefaultAsync(refresh => refresh.TokenHash == tokenHash);

        if (session is null || !session.IsActive(_timeProvider.GetUtcNow().UtcDateTime))
        {
            return Unauthorized(new { message = "Refresh token is invalid or expired." });
        }

        session.RevokedAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
        await _userManager.UpdateAsync(session.User);

        return Ok(await BuildAuthResponseAsync(session.User));
    }

    [HttpPost("logout")]
    [AllowAnonymous]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request)
    {
        var tokenHash = _jwtTokenService.HashRefreshToken(request.RefreshToken);
        var session = await _userManager.Users
            .SelectMany(user => user.RefreshSessions)
            .Include(refresh => refresh.User)
            .FirstOrDefaultAsync(refresh => refresh.TokenHash == tokenHash);

        if (session is not null)
        {
            session.RevokedAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
            await _userManager.UpdateAsync(session.User);
        }

        return NoContent();
    }

    private async Task<AuthResponse> BuildAuthResponseAsync(ApplicationUser user)
    {
        var roles = (await _userManager.GetRolesAsync(user)).ToArray();
        var accessToken = _jwtTokenService.CreateAccessToken(user, roles);
        var refreshToken = _jwtTokenService.CreateRefreshToken();

        user.RefreshSessions.Add(new RefreshSession
        {
            TokenHash = refreshToken.TokenHash,
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime,
            ExpiresAtUtc = refreshToken.ExpiresAtUtc,
            CreatedByIp = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString()
        });

        await _userManager.UpdateAsync(user);

        return new AuthResponse
        {
            AccessToken = accessToken.Token,
            RefreshToken = refreshToken.PlainTextToken,
            AccessTokenExpiresAtUtc = accessToken.ExpiresAtUtc,
            RefreshTokenExpiresAtUtc = refreshToken.ExpiresAtUtc,
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
            }
        };
    }

    private void AddIdentityErrors(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }
    }
}
