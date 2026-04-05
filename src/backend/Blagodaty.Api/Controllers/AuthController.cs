using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Auth;
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
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly JwtTokenService _jwtTokenService;
    private readonly AuthSessionService _authSessionService;
    private readonly ExternalIdentityService _externalIdentityService;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly TelegramBotUpdateService _telegramBotUpdateService;
    private readonly SessionTransferService _sessionTransferService;
    private readonly TimeProvider _timeProvider;

    public AuthController(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        JwtTokenService jwtTokenService,
        AuthSessionService authSessionService,
        ExternalIdentityService externalIdentityService,
        ExternalAuthProviderService externalAuthProviderService,
        TelegramBotUpdateService telegramBotUpdateService,
        SessionTransferService sessionTransferService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _signInManager = signInManager;
        _jwtTokenService = jwtTokenService;
        _authSessionService = authSessionService;
        _externalIdentityService = externalIdentityService;
        _externalAuthProviderService = externalAuthProviderService;
        _telegramBotUpdateService = telegramBotUpdateService;
        _sessionTransferService = sessionTransferService;
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
        await LogAuthEventAsync(user.Id, "password", "register", null);

        return Ok(await _authSessionService.CreateAuthResponseAsync(user, HttpContext, HttpContext.RequestAborted));
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

        await LogAuthEventAsync(user.Id, "password", "login", null);
        return Ok(await _authSessionService.CreateAuthResponseAsync(user, HttpContext, HttpContext.RequestAborted));
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

        return Ok(await _authSessionService.CreateAuthResponseAsync(session.User, HttpContext, HttpContext.RequestAborted));
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

    [HttpPost("session-transfer/redeem")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> RedeemSessionTransfer([FromBody] RedeemSessionTransferRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        try
        {
            return Ok(await _sessionTransferService.RedeemAsync(request.Token, HttpContext, HttpContext.RequestAborted));
        }
        catch (InvalidOperationException exception)
        {
            return Unauthorized(new { message = exception.Message });
        }
    }

    [HttpPost("external/start")]
    [AllowAnonymous]
    public async Task<ActionResult<ExternalAuthStartResponse>> StartExternalAuth([FromBody] ExternalAuthStartRequest request)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var provider = ExternalAuthProviderService.NormalizeProvider(request.Provider);
        if (string.IsNullOrWhiteSpace(provider) || provider == "telegram")
        {
            return BadRequest(new { message = "Unsupported external auth provider." });
        }

        var intent = ExternalAuthProviderService.NormalizeIntent(request.Intent);
        var currentUser = intent == ExternalAuthIntent.Link ? await GetCurrentUserAsync() : null;
        if (intent == ExternalAuthIntent.Link && currentUser is null)
        {
            return Unauthorized();
        }

        var configuration = await _externalAuthProviderService.GetConfigurationAsync(provider, HttpContext.RequestAborted);
        if (configuration is null)
        {
            return BadRequest(new { message = $"External auth provider '{provider}' is not configured." });
        }

        var state = GenerateState();
        var safeReturnUrl = NormalizeReturnUrl(request.ReturnUrl, intent);
        var redirectUri = _externalAuthProviderService.BuildAbsoluteUrl(HttpContext, $"/api/auth/external/callback/{provider}");
        var authMaterial = _externalAuthProviderService.BuildAuthorizationMaterial(configuration, state, redirectUri);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        _dbContext.ExternalAuthRequests.Add(new ExternalAuthRequest
        {
            Id = Guid.NewGuid(),
            Provider = provider,
            State = state,
            ReturnUrl = safeReturnUrl,
            Intent = intent,
            UserId = currentUser?.Id,
            Status = ExternalAuthRequestStatus.Pending,
            CodeVerifier = authMaterial.CodeVerifier,
            DeviceId = authMaterial.DeviceId,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(10)
        });

        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new ExternalAuthStartResponse
        {
            Provider = provider,
            Intent = ExternalAuthProviderService.FormatIntent(intent),
            State = state,
            AuthUrl = authMaterial.AuthorizationUrl,
            ReturnUrl = safeReturnUrl,
            ExpiresAtUtc = now.AddMinutes(10)
        });
    }

    [HttpGet("external/status/{state}")]
    [AllowAnonymous]
    public async Task<ActionResult<ExternalAuthStatusResponse>> GetExternalAuthStatus([FromRoute] string state)
    {
        var request = await _dbContext.ExternalAuthRequests
            .FirstOrDefaultAsync(item => item.State == state.Trim(), HttpContext.RequestAborted);

        if (request is null)
        {
            return NotFound(new { message = "Authorization request not found." });
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (request.ExpiresAtUtc <= now &&
            request.Status is not ExternalAuthRequestStatus.Completed and not ExternalAuthRequestStatus.Consumed and not ExternalAuthRequestStatus.Failed)
        {
            request.Status = ExternalAuthRequestStatus.Expired;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
        }

        if (request.Status != ExternalAuthRequestStatus.Completed)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = FormatRequestStatus(request.Status),
                Completed = false,
                Provider = request.Provider,
                ReturnUrl = request.ReturnUrl,
                Message = request.ErrorMessage
            });
        }

        if (request.Intent == ExternalAuthIntent.Test)
        {
            request.Status = ExternalAuthRequestStatus.Consumed;
            request.ConsumedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            return Ok(new ExternalAuthStatusResponse
            {
                Status = "completed",
                Completed = true,
                Provider = request.Provider,
                ReturnUrl = request.ReturnUrl,
                Message = request.ErrorMessage ?? "Тест авторизации завершен успешно."
            });
        }

        if (request.UserId is null)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = "pending",
                Completed = false,
                Provider = request.Provider,
                ReturnUrl = request.ReturnUrl
            });
        }

        if (request.ConsumedAtUtc.HasValue)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = "consumed",
                Completed = false,
                Provider = request.Provider,
                ReturnUrl = request.ReturnUrl
            });
        }

        if (request.Intent == ExternalAuthIntent.Link)
        {
            request.Status = ExternalAuthRequestStatus.Consumed;
            request.ConsumedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            var identity = await _dbContext.UserExternalIdentities
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.UserId == request.UserId && item.Provider == request.Provider, HttpContext.RequestAborted);

            return Ok(new ExternalAuthStatusResponse
            {
                Status = "completed",
                Completed = true,
                Linked = true,
                Provider = request.Provider,
                ReturnUrl = request.ReturnUrl,
                Identity = identity is null ? null : AccountMapper.ToExternalIdentity(identity)
            });
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == request.UserId, HttpContext.RequestAborted);
        if (user is null)
        {
            return BadRequest(new { message = "User is not available for login." });
        }

        request.Status = ExternalAuthRequestStatus.Consumed;
        request.ConsumedAtUtc = now;
        await LogAuthEventAsync(user.Id, request.Provider, "login", $"OAuth: {request.Provider}");
        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new ExternalAuthStatusResponse
        {
            Status = "completed",
            Completed = true,
            Provider = request.Provider,
            ReturnUrl = request.ReturnUrl,
            Auth = await _authSessionService.CreateAuthResponseAsync(user, HttpContext, HttpContext.RequestAborted)
        });
    }

    [HttpGet("external/callback/{provider}")]
    [AllowAnonymous]
    public async Task<IActionResult> HandleExternalAuthCallback(
        [FromRoute] string provider,
        [FromQuery] string? state,
        [FromQuery] string? code,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription)
    {
        var normalizedProvider = ExternalAuthProviderService.NormalizeProvider(provider);
        var configuration = await _externalAuthProviderService.GetConfigurationAsync(normalizedProvider, HttpContext.RequestAborted);
        if (string.IsNullOrWhiteSpace(normalizedProvider) || configuration is null)
        {
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, "Провайдер авторизации не настроен."), "text/html");
        }

        if (string.IsNullOrWhiteSpace(state))
        {
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, "Не передан state внешней авторизации."), "text/html");
        }

        var request = await _dbContext.ExternalAuthRequests
            .FirstOrDefaultAsync(item => item.Provider == normalizedProvider && item.State == state.Trim(), HttpContext.RequestAborted);
        if (request is null)
        {
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, "Запрос внешней авторизации не найден."), "text/html");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (request.ExpiresAtUtc <= now)
        {
            request.Status = ExternalAuthRequestStatus.Expired;
            request.ErrorMessage = "Срок действия запроса внешней авторизации истек.";
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, request.ErrorMessage), "text/html");
        }

        if (!string.IsNullOrWhiteSpace(error))
        {
            request.Status = ExternalAuthRequestStatus.Failed;
            request.ErrorMessage = string.IsNullOrWhiteSpace(errorDescription) ? error.Trim() : errorDescription.Trim();
            request.CompletedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, request.ErrorMessage), "text/html");
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            request.Status = ExternalAuthRequestStatus.Failed;
            request.ErrorMessage = "Провайдер не вернул код авторизации.";
            request.CompletedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
            return Content(ExternalAuthProviderService.BuildPopupHtml(false, request.ErrorMessage), "text/html");
        }

        try
        {
            var redirectUri = _externalAuthProviderService.BuildAbsoluteUrl(HttpContext, $"/api/auth/external/callback/{normalizedProvider}");
            var profile = await _externalAuthProviderService.ExchangeCodeForProfileAsync(
                configuration,
                code.Trim(),
                redirectUri,
                request.CodeVerifier,
                request.DeviceId,
                HttpContext.RequestAborted);

            if (request.Intent == ExternalAuthIntent.Link)
            {
                if (request.UserId is null)
                {
                    throw new InvalidOperationException("Пользователь для привязки не найден.");
                }

                await _externalIdentityService.AttachExternalIdentityAsync(request.UserId.Value, profile, HttpContext.RequestAborted);
                await LogAuthEventAsync(request.UserId, normalizedProvider, "link", null);
            }
            else if (request.Intent == ExternalAuthIntent.Test)
            {
                request.ErrorMessage = BuildExternalTestSuccessMessage(profile);
                await LogAuthEventAsync(null, normalizedProvider, "test", request.ErrorMessage);
            }
            else
            {
                var user = await _externalIdentityService.ResolveOrCreateExternalUserAsync(profile, HttpContext.RequestAborted);
                request.UserId = user.Id;
            }

            request.Status = ExternalAuthRequestStatus.Completed;
            request.CompletedAtUtc = now;
            request.ErrorMessage ??= null;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            return Content(
                ExternalAuthProviderService.BuildPopupHtml(
                    true,
                    request.Intent == ExternalAuthIntent.Test ? request.ErrorMessage : "Можно вернуться на сайт."),
                "text/html");
        }
        catch (Exception exception)
        {
            request.Status = ExternalAuthRequestStatus.Failed;
            request.ErrorMessage = exception.Message;
            request.CompletedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            return Content(ExternalAuthProviderService.BuildPopupHtml(false, exception.Message), "text/html");
        }
    }

    [HttpPost("telegram/login")]
    [AllowAnonymous]
    public async Task<ActionResult<AuthResponse>> TelegramLogin([FromBody] TelegramWidgetLoginRequest request)
    {
        var botToken = await _externalAuthProviderService.GetTelegramBotTokenAsync(HttpContext.RequestAborted);
        if (string.IsNullOrWhiteSpace(botToken) || !await _externalAuthProviderService.IsTelegramWidgetReadyAsync(HttpContext.RequestAborted))
        {
            return BadRequest(new { message = "Telegram widget is not configured." });
        }

        var payload = new TelegramWidgetPayload(
            request.Id,
            request.FirstName,
            request.LastName,
            request.Username,
            request.PhotoUrl,
            request.AuthDate,
            request.Hash);

        if (!ExternalAuthProviderService.ValidateTelegramWidgetPayload(payload, botToken))
        {
            return BadRequest(new { message = "Invalid Telegram auth payload." });
        }

        var displayName = string.Join(" ", new[] { request.FirstName, request.LastName }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        var telegramChatId = long.TryParse(request.Id, out var numericId) ? numericId : (long?)null;

        var user = await _externalIdentityService.ResolveOrCreateExternalUserAsync(
            new ExternalIdentityProfile(
                Provider: "telegram",
                ProviderUserId: request.Id,
                Email: null,
                EmailVerified: false,
                Username: request.Username,
                DisplayName: displayName,
                AvatarUrl: request.PhotoUrl,
                TelegramChatId: telegramChatId),
            HttpContext.RequestAborted);

        await LogAuthEventAsync(user.Id, "telegram", "login", "Telegram widget");
        return Ok(await _authSessionService.CreateAuthResponseAsync(user, HttpContext, HttpContext.RequestAborted));
    }

    [HttpPost("telegram/start")]
    [AllowAnonymous]
    public async Task<ActionResult<ExternalAuthStartResponse>> StartTelegramAuth([FromBody] ExternalAuthStartRequest? request)
    {
        var intent = ExternalAuthProviderService.NormalizeIntent(request?.Intent);
        var currentUser = intent == ExternalAuthIntent.Link ? await GetCurrentUserAsync() : null;
        if (intent == ExternalAuthIntent.Link && currentUser is null)
        {
            return Unauthorized();
        }

        var botUsername = await _externalAuthProviderService.GetTelegramBotUsernameAsync(HttpContext.RequestAborted);
        var botToken = await _externalAuthProviderService.GetTelegramBotTokenAsync(HttpContext.RequestAborted);
        var telegramEnabled = await _dbContext.AppSettings
            .Where(item => item.Key == ExternalAuthSettingKeys.TelegramLoginEnabled)
            .Select(item => item.Value)
            .FirstOrDefaultAsync(HttpContext.RequestAborted);
        var isEnabled = string.IsNullOrWhiteSpace(telegramEnabled) || string.Equals(telegramEnabled, "true", StringComparison.OrdinalIgnoreCase);

        if (!isEnabled || string.IsNullOrWhiteSpace(botUsername) || string.IsNullOrWhiteSpace(botToken))
        {
            return BadRequest(new { message = "Telegram login bot is not configured." });
        }

        var state = GenerateState();
        var safeReturnUrl = NormalizeReturnUrl(request?.ReturnUrl, intent);
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        _dbContext.TelegramAuthRequests.Add(new TelegramAuthRequest
        {
            Id = Guid.NewGuid(),
            UserId = currentUser?.Id,
            State = state,
            ReturnUrl = safeReturnUrl,
            Intent = intent,
            Status = ExternalAuthRequestStatus.Pending,
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(10)
        });

        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new ExternalAuthStartResponse
        {
            Provider = "telegram",
            Intent = ExternalAuthProviderService.FormatIntent(intent),
            State = state,
            AuthUrl = $"https://t.me/{botUsername}?start=login_{state}",
            ReturnUrl = safeReturnUrl,
            ExpiresAtUtc = now.AddMinutes(10)
        });
    }

    [HttpGet("telegram/status/{state}")]
    [AllowAnonymous]
    public async Task<ActionResult<ExternalAuthStatusResponse>> GetTelegramAuthStatus([FromRoute] string state)
    {
        var request = await _dbContext.TelegramAuthRequests
            .FirstOrDefaultAsync(item => item.State == state.Trim(), HttpContext.RequestAborted);

        if (request is null)
        {
            return NotFound(new { message = "Authorization request not found." });
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (request.ExpiresAtUtc <= now &&
            request.Status is not ExternalAuthRequestStatus.Completed and not ExternalAuthRequestStatus.Consumed and not ExternalAuthRequestStatus.Failed)
        {
            request.Status = ExternalAuthRequestStatus.Expired;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
        }

        if (request.Status != ExternalAuthRequestStatus.Completed)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = FormatRequestStatus(request.Status),
                Completed = false,
                Provider = "telegram",
                ReturnUrl = request.ReturnUrl,
                Message = request.ErrorMessage
            });
        }

        if (request.Intent == ExternalAuthIntent.Test)
        {
            request.Status = ExternalAuthRequestStatus.Consumed;
            request.ConsumedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            return Ok(new ExternalAuthStatusResponse
            {
                Status = "completed",
                Completed = true,
                Provider = "telegram",
                ReturnUrl = request.ReturnUrl,
                Message = request.ErrorMessage ?? "Telegram test completed."
            });
        }

        if (request.UserId is null)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = "pending",
                Completed = false,
                Provider = "telegram",
                ReturnUrl = request.ReturnUrl
            });
        }

        if (request.ConsumedAtUtc.HasValue)
        {
            return Ok(new ExternalAuthStatusResponse
            {
                Status = "consumed",
                Completed = false,
                Provider = "telegram",
                ReturnUrl = request.ReturnUrl
            });
        }

        if (request.Intent == ExternalAuthIntent.Link)
        {
            request.Status = ExternalAuthRequestStatus.Consumed;
            request.ConsumedAtUtc = now;
            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            var identity = await _dbContext.UserExternalIdentities
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.UserId == request.UserId && item.Provider == "telegram", HttpContext.RequestAborted);

            return Ok(new ExternalAuthStatusResponse
            {
                Status = "completed",
                Completed = true,
                Provider = "telegram",
                Linked = true,
                ReturnUrl = request.ReturnUrl,
                Identity = identity is null ? null : AccountMapper.ToExternalIdentity(identity)
            });
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == request.UserId, HttpContext.RequestAborted);
        if (user is null)
        {
            return BadRequest(new { message = "User is not available for login." });
        }

        request.Status = ExternalAuthRequestStatus.Consumed;
        request.ConsumedAtUtc = now;
        await LogAuthEventAsync(user.Id, "telegram", "login", "Telegram bot");
        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        return Ok(new ExternalAuthStatusResponse
        {
            Status = "completed",
            Completed = true,
            Provider = "telegram",
            ReturnUrl = request.ReturnUrl,
            Auth = await _authSessionService.CreateAuthResponseAsync(user, HttpContext, HttpContext.RequestAborted)
        });
    }

    [HttpPost("telegram/webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> HandleTelegramWebhook([FromBody] JsonDocument update)
    {
        var configuredSecret = await _externalAuthProviderService.GetTelegramWebhookSecretAsync(HttpContext.RequestAborted);
        if (!string.IsNullOrWhiteSpace(configuredSecret))
        {
            var incomingSecret = Request.Headers["X-Telegram-Bot-Api-Secret-Token"].ToString();
            if (!string.Equals(configuredSecret, incomingSecret, StringComparison.Ordinal))
            {
                return Unauthorized();
            }
        }

        await _telegramBotUpdateService.HandleUpdateAsync(update, HttpContext.RequestAborted);
        return Ok();
    }

    private async Task<ApplicationUser?> GetCurrentUserAsync()
    {
        var userIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId, HttpContext.RequestAborted);
    }

    private Task LogAuthEventAsync(Guid? userId, string provider, string eventType, string? detail)
    {
        _dbContext.AuthEvents.Add(new AuthEvent
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Provider = provider,
            EventType = eventType,
            Detail = detail,
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
        });

        return Task.CompletedTask;
    }

    private void AddIdentityErrors(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }
    }

    private static string NormalizeReturnUrl(string? returnUrl, ExternalAuthIntent intent)
    {
        var normalized = returnUrl?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return intent == ExternalAuthIntent.Link ? "/profile" : "/dashboard";
        }

        return normalized.StartsWith("/", StringComparison.Ordinal) ? normalized : "/dashboard";
    }

    private static string FormatRequestStatus(ExternalAuthRequestStatus status) => status.ToString().ToLowerInvariant();

    private static string GenerateState()
    {
        Span<byte> bytes = stackalloc byte[18];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static string? ExtractTelegramState(string? text)
    {
        var normalized = text?.Trim();
        const string prefix = "/start login_";
        if (string.IsNullOrWhiteSpace(normalized) || !normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return normalized[prefix.Length..].Trim();
    }

    private static string? ReadTelegramString(JsonElement root, string propertyName)
    {
        if (!root.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString()?.Trim(),
            JsonValueKind.Number => value.GetInt64().ToString(),
            _ => null
        };
    }

    private static string BuildExternalTestSuccessMessage(ExternalIdentityProfile profile)
    {
        var providerName = ExternalAuthProviderService.GetProviderDisplayName(profile.Provider);
        var identity = !string.IsNullOrWhiteSpace(profile.Email)
            ? profile.Email!.Trim()
            : !string.IsNullOrWhiteSpace(profile.Username)
                ? "@" + profile.Username!.Trim().TrimStart('@')
                : profile.ProviderUserId.Trim();
        var displayName = string.IsNullOrWhiteSpace(profile.DisplayName)
            ? "Пользователь"
            : profile.DisplayName.Trim();

        return $"{providerName}: проверка прошла успешно. Получен профиль {displayName} ({identity}).";
    }

    private static string BuildTelegramTestSuccessMessage(string? username, string telegramUserId)
    {
        var identity = !string.IsNullOrWhiteSpace(username)
            ? "@" + username.Trim().TrimStart('@')
            : telegramUserId.Trim();

        return $"Telegram: проверка прошла успешно. Бот получил пользователя {identity}.";
    }
}
