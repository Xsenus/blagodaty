using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Auth;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed class SessionTransferService
{
    private static readonly TimeSpan ChallengeLifetime = TimeSpan.FromMinutes(5);

    private readonly AppDbContext _dbContext;
    private readonly JwtTokenService _jwtTokenService;
    private readonly AuthSessionService _authSessionService;
    private readonly TimeProvider _timeProvider;

    public SessionTransferService(
        AppDbContext dbContext,
        JwtTokenService jwtTokenService,
        AuthSessionService authSessionService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _jwtTokenService = jwtTokenService;
        _authSessionService = authSessionService;
        _timeProvider = timeProvider;
    }

    public async Task<CreateSessionTransferResponse> CreateAsync(
        ApplicationUser user,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        await CleanupUserChallengesAsync(user.Id, now, cancellationToken);

        var tokenMaterial = _jwtTokenService.CreateRefreshToken();
        var challenge = new SessionTransferChallenge
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = tokenMaterial.TokenHash,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.Add(ChallengeLifetime),
            CreatedByIp = httpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = httpContext.Request.Headers.UserAgent.ToString()
        };

        _dbContext.SessionTransferChallenges.Add(challenge);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new CreateSessionTransferResponse
        {
            Token = tokenMaterial.PlainTextToken,
            ExpiresAtUtc = challenge.ExpiresAtUtc
        };
    }

    public async Task<AuthResponse> RedeemAsync(
        string token,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        var normalizedToken = token.Trim();
        if (string.IsNullOrWhiteSpace(normalizedToken))
        {
            throw new InvalidOperationException("Transfer token is missing.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var tokenHash = _jwtTokenService.HashRefreshToken(normalizedToken);
        var challenge = await _dbContext.SessionTransferChallenges
            .Include(item => item.User)
            .FirstOrDefaultAsync(item => item.TokenHash == tokenHash, cancellationToken);

        if (challenge is null || !challenge.IsActive(now))
        {
            throw new InvalidOperationException("Transfer token is invalid or expired.");
        }

        challenge.ConsumedAtUtc = now;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await _authSessionService.CreateAuthResponseAsync(challenge.User, httpContext, cancellationToken);
    }

    private async Task CleanupUserChallengesAsync(Guid userId, DateTime utcNow, CancellationToken cancellationToken)
    {
        var staleChallenges = await _dbContext.SessionTransferChallenges
            .Where(item => item.UserId == userId && (item.ConsumedAtUtc != null || item.ExpiresAtUtc <= utcNow))
            .ToListAsync(cancellationToken);

        if (staleChallenges.Count == 0)
        {
            return;
        }

        _dbContext.SessionTransferChallenges.RemoveRange(staleChallenges);
        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}
