using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Contracts.Auth;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin/auth")]
public sealed class AdminAuthController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly TimeProvider _timeProvider;

    public AdminAuthController(
        AppDbContext dbContext,
        ExternalAuthProviderService externalAuthProviderService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _externalAuthProviderService = externalAuthProviderService;
        _timeProvider = timeProvider;
    }

    [HttpGet("settings")]
    public async Task<ActionResult<AdminExternalAuthSettingsResponse>> GetSettings()
    {
        return Ok(await _externalAuthProviderService.GetAdminSettingsAsync(HttpContext, HttpContext.RequestAborted));
    }

    [HttpPut("providers/{provider}")]
    public async Task<ActionResult<AdminExternalAuthProviderDto>> UpdateProvider(
        [FromRoute] string provider,
        [FromBody] UpdateExternalAuthProviderRequest request)
    {
        try
        {
            return Ok(await _externalAuthProviderService.UpdateProviderAsync(provider, request, HttpContext, HttpContext.RequestAborted));
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new { message = exception.Message });
        }
    }

    [HttpPost("providers/{provider}/test/start")]
    public async Task<ActionResult<ExternalAuthStartResponse>> StartProviderTest([FromRoute] string provider)
    {
        var normalizedProvider = ExternalAuthProviderService.NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
        {
            return BadRequest(new { message = "Unsupported external auth provider." });
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var state = GenerateState();

        if (normalizedProvider == "telegram")
        {
            var botUsername = await _externalAuthProviderService.GetTelegramBotUsernameAsync(HttpContext.RequestAborted);
            var botToken = await _externalAuthProviderService.GetTelegramBotTokenAsync(HttpContext.RequestAborted);
            var isEnabled = await _dbContext.AppSettings
                .Where(item => item.Key == ExternalAuthSettingKeys.TelegramLoginEnabled)
                .Select(item => item.Value)
                .FirstOrDefaultAsync(HttpContext.RequestAborted);

            if ((isEnabled is not null && !string.Equals(isEnabled, "true", StringComparison.OrdinalIgnoreCase)) ||
                string.IsNullOrWhiteSpace(botUsername) ||
                string.IsNullOrWhiteSpace(botToken))
            {
                return BadRequest(new { message = "Telegram login bot is not configured." });
            }

            _dbContext.TelegramAuthRequests.Add(new TelegramAuthRequest
            {
                Id = Guid.NewGuid(),
                State = state,
                ReturnUrl = "/admin",
                Intent = ExternalAuthIntent.Test,
                Status = ExternalAuthRequestStatus.Pending,
                CreatedAtUtc = now,
                ExpiresAtUtc = now.AddMinutes(10)
            });

            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            return Ok(new ExternalAuthStartResponse
            {
                Provider = "telegram",
                Intent = "test",
                State = state,
                AuthUrl = $"https://t.me/{botUsername}?start=login_{state}",
                ReturnUrl = "/admin",
                ExpiresAtUtc = now.AddMinutes(10)
            });
        }

        var configuration = await _externalAuthProviderService.GetConfigurationAsync(normalizedProvider, HttpContext.RequestAborted);
        if (configuration is null)
        {
            return BadRequest(new { message = $"External auth provider '{normalizedProvider}' is not configured." });
        }

        var redirectUri = _externalAuthProviderService.BuildAbsoluteUrl(HttpContext, $"/api/auth/external/callback/{normalizedProvider}");
        var authMaterial = _externalAuthProviderService.BuildAuthorizationMaterial(configuration, state, redirectUri);

        _dbContext.ExternalAuthRequests.Add(new ExternalAuthRequest
        {
            Id = Guid.NewGuid(),
            Provider = normalizedProvider,
            State = state,
            ReturnUrl = "/admin",
            Intent = ExternalAuthIntent.Test,
            Status = ExternalAuthRequestStatus.Pending,
            CodeVerifier = authMaterial.CodeVerifier,
            DeviceId = authMaterial.DeviceId,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(10)
        });

        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new ExternalAuthStartResponse
        {
            Provider = normalizedProvider,
            Intent = "test",
            State = state,
            AuthUrl = authMaterial.AuthorizationUrl,
            ReturnUrl = "/admin",
            ExpiresAtUtc = now.AddMinutes(10)
        });
    }

    private static string GenerateState()
    {
        Span<byte> bytes = stackalloc byte[18];
        System.Security.Cryptography.RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
