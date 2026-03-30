using Blagodaty.Api.Contracts.Auth;
using Blagodaty.Api.Models;
using Microsoft.AspNetCore.Identity;

namespace Blagodaty.Api.Services;

public sealed class AuthSessionService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly JwtTokenService _jwtTokenService;
    private readonly TimeProvider _timeProvider;

    public AuthSessionService(
        UserManager<ApplicationUser> userManager,
        JwtTokenService jwtTokenService,
        TimeProvider timeProvider)
    {
        _userManager = userManager;
        _jwtTokenService = jwtTokenService;
        _timeProvider = timeProvider;
    }

    public async Task<AuthResponse> CreateAuthResponseAsync(
        ApplicationUser user,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        var roles = (await _userManager.GetRolesAsync(user)).ToArray();
        var accessToken = _jwtTokenService.CreateAccessToken(user, roles);
        var refreshToken = _jwtTokenService.CreateRefreshToken();
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        user.LastLoginAtUtc = now;
        user.RefreshSessions.Add(new RefreshSession
        {
            TokenHash = refreshToken.TokenHash,
            CreatedAtUtc = now,
            ExpiresAtUtc = refreshToken.ExpiresAtUtc,
            CreatedByIp = httpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = httpContext.Request.Headers.UserAgent.ToString()
        });

        await _userManager.UpdateAsync(user);

        return new AuthResponse
        {
            AccessToken = accessToken.Token,
            RefreshToken = refreshToken.PlainTextToken,
            AccessTokenExpiresAtUtc = accessToken.ExpiresAtUtc,
            RefreshTokenExpiresAtUtc = refreshToken.ExpiresAtUtc,
            User = AccountMapper.ToUserSummary(user, roles)
        };
    }
}
