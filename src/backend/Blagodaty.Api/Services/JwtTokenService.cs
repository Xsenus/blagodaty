using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Blagodaty.Api.Services;

public sealed class JwtTokenService
{
    private readonly JwtOptions _jwtOptions;
    private readonly TimeProvider _timeProvider;

    public JwtTokenService(IOptions<JwtOptions> jwtOptions, TimeProvider timeProvider)
    {
        _jwtOptions = jwtOptions.Value;
        _timeProvider = timeProvider;
    }

    public AccessTokenResult CreateAccessToken(ApplicationUser user, IReadOnlyCollection<string> roles)
    {
        var now = _timeProvider.GetUtcNow();
        var expiresAt = now.AddMinutes(_jwtOptions.AccessTokenMinutes);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(JwtRegisteredClaimNames.UniqueName, user.DisplayName),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Name, user.DisplayName)
        };

        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwtOptions.Secret)),
            SecurityAlgorithms.HmacSha256);

        var descriptor = new JwtSecurityToken(
            issuer: _jwtOptions.Issuer,
            audience: _jwtOptions.Audience,
            claims: claims,
            notBefore: now.UtcDateTime,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        var handler = new JwtSecurityTokenHandler();

        return new AccessTokenResult(handler.WriteToken(descriptor), expiresAt.UtcDateTime);
    }

    public RefreshTokenMaterial CreateRefreshToken()
    {
        Span<byte> bytes = stackalloc byte[48];
        RandomNumberGenerator.Fill(bytes);

        var token = Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        var expiresAt = _timeProvider.GetUtcNow().AddDays(_jwtOptions.RefreshTokenDays).UtcDateTime;

        return new RefreshTokenMaterial(token, HashRefreshToken(token), expiresAt);
    }

    public string HashRefreshToken(string token)
    {
        var rawBytes = Encoding.UTF8.GetBytes(token);
        var hashedBytes = SHA256.HashData(rawBytes);
        return Convert.ToHexString(hashedBytes);
    }
}

public sealed record AccessTokenResult(string Token, DateTime ExpiresAtUtc);

public sealed record RefreshTokenMaterial(string PlainTextToken, string TokenHash, DateTime ExpiresAtUtc);
