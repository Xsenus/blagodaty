using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Contracts.Public;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;

namespace Blagodaty.Api.Services;

public sealed class ExternalAuthProviderService
{
    private readonly AppDbContext _dbContext;
    private readonly AppSettingsService _appSettingsService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly TimeProvider _timeProvider;

    public ExternalAuthProviderService(
        AppDbContext dbContext,
        AppSettingsService appSettingsService,
        IHttpClientFactory httpClientFactory,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _appSettingsService = appSettingsService;
        _httpClientFactory = httpClientFactory;
        _timeProvider = timeProvider;
    }

    public static string NormalizeProvider(string? provider) => TechnicalEmailHelper.NormalizeProvider(provider);

    public static ExternalAuthIntent NormalizeIntent(string? intent)
    {
        var normalized = intent?.Trim().ToLowerInvariant();
        return normalized switch
        {
            "link" => ExternalAuthIntent.Link,
            "test" => ExternalAuthIntent.Test,
            _ => ExternalAuthIntent.SignIn
        };
    }

    public static string FormatIntent(ExternalAuthIntent intent) => intent switch
    {
        ExternalAuthIntent.Link => "link",
        ExternalAuthIntent.Test => "test",
        _ => "signin"
    };

    public static string GetProviderDisplayName(string provider)
    {
        return NormalizeProvider(provider) switch
        {
            "google" => "Google",
            "vk" => "VK",
            "yandex" => "Yandex",
            "telegram" => "Telegram",
            _ => provider
        };
    }

    public async Task<ExternalProviderConfiguration?> GetConfigurationAsync(
        string provider,
        CancellationToken cancellationToken = default)
    {
        return NormalizeProvider(provider) switch
        {
            "google" => await BuildConfigurationAsync(
                provider: "google",
                displayName: "Google",
                enabledKey: ExternalAuthSettingKeys.GoogleEnabled,
                enabledConfigPath: "Auth:Google:Enabled",
                clientIdKey: ExternalAuthSettingKeys.GoogleClientId,
                clientIdConfigPath: "Auth:Google:ClientId",
                clientSecretKey: ExternalAuthSettingKeys.GoogleClientSecret,
                clientSecretConfigPath: "Auth:Google:ClientSecret",
                authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                tokenEndpoint: "https://oauth2.googleapis.com/token",
                userInfoEndpoint: "https://openidconnect.googleapis.com/v1/userinfo",
                scope: "openid email profile",
                cancellationToken: cancellationToken),
            "vk" => await BuildConfigurationAsync(
                provider: "vk",
                displayName: "VK",
                enabledKey: ExternalAuthSettingKeys.VkEnabled,
                enabledConfigPath: "Auth:Vk:Enabled",
                clientIdKey: ExternalAuthSettingKeys.VkClientId,
                clientIdConfigPath: "Auth:Vk:ClientId",
                clientSecretKey: ExternalAuthSettingKeys.VkClientSecret,
                clientSecretConfigPath: "Auth:Vk:ClientSecret",
                authorizationEndpoint: "https://id.vk.ru/authorize",
                tokenEndpoint: "https://id.vk.ru/oauth2/auth",
                userInfoEndpoint: "https://id.vk.ru/oauth2/user_info",
                scope: "email",
                cancellationToken: cancellationToken),
            "yandex" => await BuildConfigurationAsync(
                provider: "yandex",
                displayName: "Yandex",
                enabledKey: ExternalAuthSettingKeys.YandexEnabled,
                enabledConfigPath: "Auth:Yandex:Enabled",
                clientIdKey: ExternalAuthSettingKeys.YandexClientId,
                clientIdConfigPath: "Auth:Yandex:ClientId",
                clientSecretKey: ExternalAuthSettingKeys.YandexClientSecret,
                clientSecretConfigPath: "Auth:Yandex:ClientSecret",
                authorizationEndpoint: "https://oauth.yandex.com/authorize",
                tokenEndpoint: "https://oauth.yandex.com/token",
                userInfoEndpoint: "https://login.yandex.ru/info?format=json",
                scope: "login:info login:email login:avatar",
                cancellationToken: cancellationToken),
            _ => null
        };
    }

    public async Task<IReadOnlyCollection<PublicExternalAuthProviderDto>> GetPublicProvidersAsync(
        CancellationToken cancellationToken = default)
    {
        var google = await GetConfigurationAsync("google", cancellationToken);
        var vk = await GetConfigurationAsync("vk", cancellationToken);
        var yandex = await GetConfigurationAsync("yandex", cancellationToken);
        var telegramLoginEnabled = await _appSettingsService.GetBooleanAsync(
            ExternalAuthSettingKeys.TelegramLoginEnabled,
            fallback: false,
            configPath: "Auth:Telegram:Enabled",
            cancellationToken);
        var telegramWidgetEnabled = await _appSettingsService.GetBooleanAsync(
            ExternalAuthSettingKeys.TelegramWidgetEnabled,
            fallback: false,
            configPath: "Auth:Telegram:WidgetEnabled",
            cancellationToken);
        var telegramBotUsername = await GetTelegramBotUsernameAsync(cancellationToken);
        var telegramBotToken = await GetTelegramBotTokenAsync(cancellationToken);

        return
        [
            BuildPublicProvider("google", "oauth", google is not null),
            BuildPublicProvider("vk", "oauth", vk is not null),
            BuildPublicProvider("yandex", "oauth", yandex is not null),
            new()
            {
                Provider = "telegram",
                DisplayName = "Telegram",
                Mode = "telegram",
                Enabled = telegramLoginEnabled && !string.IsNullOrWhiteSpace(telegramBotUsername) && !string.IsNullOrWhiteSpace(telegramBotToken),
                WidgetEnabled = telegramWidgetEnabled && !string.IsNullOrWhiteSpace(telegramBotUsername) && !string.IsNullOrWhiteSpace(telegramBotToken),
                BotUsername = telegramBotUsername
            }
        ];
    }

    public async Task<AdminExternalAuthSettingsResponse> GetAdminSettingsAsync(
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        var providers = new List<AdminExternalAuthProviderDto>();

        foreach (var provider in new[] { "google", "vk", "yandex" })
        {
            var configuration = await GetConfigurationAsync(provider, cancellationToken);
            var enabledKey = provider switch
            {
                "google" => ExternalAuthSettingKeys.GoogleEnabled,
                "vk" => ExternalAuthSettingKeys.VkEnabled,
                "yandex" => ExternalAuthSettingKeys.YandexEnabled,
                _ => string.Empty
            };
            var clientIdKey = provider switch
            {
                "google" => ExternalAuthSettingKeys.GoogleClientId,
                "vk" => ExternalAuthSettingKeys.VkClientId,
                "yandex" => ExternalAuthSettingKeys.YandexClientId,
                _ => string.Empty
            };
            var clientSecretKey = provider switch
            {
                "google" => ExternalAuthSettingKeys.GoogleClientSecret,
                "vk" => ExternalAuthSettingKeys.VkClientSecret,
                "yandex" => ExternalAuthSettingKeys.YandexClientSecret,
                _ => string.Empty
            };
            var enabled = await _appSettingsService.GetBooleanAsync(enabledKey, false, null, cancellationToken);
            var clientId = AppSettingsService.NormalizeValue(await _appSettingsService.GetStringAsync(clientIdKey, null, cancellationToken));
            var clientSecret = await _appSettingsService.GetStringAsync(clientSecretKey, null, cancellationToken);
            var callbackUrl = BuildAbsoluteUrl(httpContext, $"/api/auth/external/callback/{provider}");

            providers.Add(new AdminExternalAuthProviderDto
            {
                Provider = provider,
                DisplayName = GetProviderDisplayName(provider),
                Mode = "oauth",
                Enabled = enabled,
                Ready = configuration is not null,
                WidgetEnabled = false,
                ClientId = clientId,
                ClientSecretMasked = AppSettingsService.MaskSecret(clientSecret),
                CallbackUrl = callbackUrl,
                Hints = BuildOAuthHints(provider, callbackUrl),
                Diagnostics = BuildOAuthDiagnostics(enabled, clientId, clientSecret, callbackUrl)
            });
        }

        var telegramBotUsername = await GetTelegramBotUsernameAsync(cancellationToken);
        var telegramBotToken = await GetTelegramBotTokenAsync(cancellationToken);
        var telegramEnabled = await _appSettingsService.GetBooleanAsync(ExternalAuthSettingKeys.TelegramLoginEnabled, false, "Auth:Telegram:Enabled", cancellationToken);
        var telegramWidgetEnabled = await _appSettingsService.GetBooleanAsync(ExternalAuthSettingKeys.TelegramWidgetEnabled, false, "Auth:Telegram:WidgetEnabled", cancellationToken);
        var webhookSecret = await GetTelegramWebhookSecretAsync(cancellationToken);
        var webhookUrl = BuildAbsoluteUrl(httpContext, "/api/auth/telegram/webhook");

        providers.Add(new AdminExternalAuthProviderDto
        {
            Provider = "telegram",
            DisplayName = "Telegram",
            Mode = "telegram",
            Enabled = telegramEnabled,
            Ready = telegramEnabled && !string.IsNullOrWhiteSpace(telegramBotUsername) && !string.IsNullOrWhiteSpace(telegramBotToken),
            WidgetEnabled = telegramWidgetEnabled,
            BotUsername = telegramBotUsername,
            BotTokenMasked = AppSettingsService.MaskSecret(telegramBotToken),
            WebhookSecretMasked = AppSettingsService.MaskSecret(webhookSecret),
            WebhookUrl = webhookUrl,
            Hints = BuildTelegramHints(webhookUrl),
            Diagnostics = BuildTelegramDiagnostics(telegramEnabled, telegramWidgetEnabled, telegramBotUsername, telegramBotToken, webhookSecret, webhookUrl)
        });

        var recentEvents = await _dbContext.AuthEvents
            .AsNoTracking()
            .OrderByDescending(item => item.CreatedAtUtc)
            .Take(50)
            .Select(item => new AdminExternalAuthEventDto
            {
                Id = item.Id,
                UserId = item.UserId,
                Provider = item.Provider,
                EventType = item.EventType,
                Detail = item.Detail,
                CreatedAtUtc = item.CreatedAtUtc
            })
            .ToArrayAsync(cancellationToken);

        return new AdminExternalAuthSettingsResponse
        {
            Providers = providers,
            RecentEvents = recentEvents
        };
    }

    public async Task<AdminExternalAuthProviderDto> UpdateProviderAsync(
        string provider,
        UpdateExternalAuthProviderRequest request,
        HttpContext httpContext,
        CancellationToken cancellationToken = default)
    {
        var normalizedProvider = NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider))
        {
            throw new InvalidOperationException("Unsupported external auth provider.");
        }

        switch (normalizedProvider)
        {
            case "google":
                await SaveOAuthProviderAsync(ExternalAuthSettingKeys.GoogleEnabled, ExternalAuthSettingKeys.GoogleClientId, ExternalAuthSettingKeys.GoogleClientSecret, request, cancellationToken);
                break;
            case "vk":
                await SaveOAuthProviderAsync(ExternalAuthSettingKeys.VkEnabled, ExternalAuthSettingKeys.VkClientId, ExternalAuthSettingKeys.VkClientSecret, request, cancellationToken);
                break;
            case "yandex":
                await SaveOAuthProviderAsync(ExternalAuthSettingKeys.YandexEnabled, ExternalAuthSettingKeys.YandexClientId, ExternalAuthSettingKeys.YandexClientSecret, request, cancellationToken);
                break;
            case "telegram":
                await _appSettingsService.UpsertAsync(ExternalAuthSettingKeys.TelegramLoginEnabled, request.Enabled ? "true" : "false", "Telegram bot login enabled", false, cancellationToken);
                await _appSettingsService.UpsertAsync(ExternalAuthSettingKeys.TelegramWidgetEnabled, (request.WidgetEnabled ?? false) ? "true" : "false", "Telegram widget login enabled", false, cancellationToken);
                if (request.BotUsername is not null)
                {
                    await _appSettingsService.UpsertAsync(ExternalAuthSettingKeys.TelegramBotUsername, request.BotUsername, "Telegram bot username", false, cancellationToken);
                }
                if (request.BotToken is not null)
                {
                    await _appSettingsService.UpsertAsync(ExternalAuthSettingKeys.TelegramBotToken, request.BotToken, "Telegram bot token", true, cancellationToken);
                }
                if (request.WebhookSecret is not null)
                {
                    await _appSettingsService.UpsertAsync(ExternalAuthSettingKeys.TelegramWebhookSecret, request.WebhookSecret, "Telegram webhook secret", true, cancellationToken);
                }
                break;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return (await GetAdminSettingsAsync(httpContext, cancellationToken)).Providers.First(item => item.Provider == normalizedProvider);
    }

    public ExternalAuthorizationMaterial BuildAuthorizationMaterial(
        ExternalProviderConfiguration configuration,
        string state,
        string redirectUri)
    {
        var query = new Dictionary<string, string?>
        {
            ["client_id"] = configuration.ClientId,
            ["redirect_uri"] = redirectUri,
            ["response_type"] = "code",
            ["state"] = state
        };

        if (!string.IsNullOrWhiteSpace(configuration.Scope))
        {
            query["scope"] = configuration.Scope;
        }

        string? codeVerifier = null;
        string? deviceId = null;

        if (configuration.Provider == "google")
        {
            query["access_type"] = "online";
            query["include_granted_scopes"] = "true";
            query["prompt"] = "select_account";
        }
        else if (configuration.Provider == "vk")
        {
            codeVerifier = BuildVkCodeVerifier();
            deviceId = Guid.NewGuid().ToString("N");
            query["app_id"] = configuration.ClientId;
            query["sdk_type"] = "vkid";
            query["code_challenge"] = BuildVkCodeChallenge(codeVerifier);
            query["code_challenge_method"] = "s256";
        }

        return new ExternalAuthorizationMaterial(QueryHelpers.AddQueryString(configuration.AuthorizationEndpoint, query!), codeVerifier, deviceId);
    }

    public async Task<ExternalIdentityProfile> ExchangeCodeForProfileAsync(
        ExternalProviderConfiguration configuration,
        string code,
        string redirectUri,
        string? codeVerifier,
        string? deviceId,
        CancellationToken cancellationToken = default)
    {
        var tokenResult = await ExchangeAccessTokenAsync(configuration, code, redirectUri, codeVerifier, deviceId, cancellationToken);

        return configuration.Provider switch
        {
            "google" => await LoadGoogleProfileAsync(tokenResult.AccessToken, cancellationToken),
            "vk" => await LoadVkProfileAsync(configuration, tokenResult, cancellationToken),
            "yandex" => await LoadYandexProfileAsync(tokenResult.AccessToken, cancellationToken),
            _ => throw new InvalidOperationException("Unsupported external auth provider.")
        };
    }

    public async Task<bool> IsTelegramWidgetReadyAsync(CancellationToken cancellationToken = default)
    {
        var enabled = await _appSettingsService.GetBooleanAsync(
            ExternalAuthSettingKeys.TelegramWidgetEnabled,
            fallback: false,
            configPath: "Auth:Telegram:WidgetEnabled",
            cancellationToken);
        if (!enabled)
        {
            return false;
        }

        var username = await GetTelegramBotUsernameAsync(cancellationToken);
        var token = await GetTelegramBotTokenAsync(cancellationToken);
        return !string.IsNullOrWhiteSpace(username) && !string.IsNullOrWhiteSpace(token);
    }

    public async Task<string?> GetTelegramBotUsernameAsync(CancellationToken cancellationToken = default)
    {
        return AppSettingsService.NormalizeValue(
            await _appSettingsService.GetStringAsync(
                ExternalAuthSettingKeys.TelegramBotUsername,
                "Auth:Telegram:BotUsername",
                cancellationToken));
    }

    public async Task<string?> GetTelegramBotTokenAsync(CancellationToken cancellationToken = default)
    {
        return AppSettingsService.NormalizeValue(
            await _appSettingsService.GetStringAsync(
                ExternalAuthSettingKeys.TelegramBotToken,
                "Auth:Telegram:BotToken",
                cancellationToken));
    }

    public async Task<string?> GetTelegramWebhookSecretAsync(CancellationToken cancellationToken = default)
    {
        return AppSettingsService.NormalizeValue(
            await _appSettingsService.GetStringAsync(
                ExternalAuthSettingKeys.TelegramWebhookSecret,
                "Auth:Telegram:WebhookSecret",
                cancellationToken));
    }

    public static bool ValidateTelegramWidgetPayload(TelegramWidgetPayload payload, string botToken)
    {
        if (string.IsNullOrWhiteSpace(payload.Id) ||
            string.IsNullOrWhiteSpace(payload.AuthDate) ||
            string.IsNullOrWhiteSpace(payload.Hash))
        {
            return false;
        }

        var entries = new List<string>
        {
            $"auth_date={payload.AuthDate}",
            $"id={payload.Id}"
        };

        if (!string.IsNullOrWhiteSpace(payload.FirstName)) entries.Add($"first_name={payload.FirstName}");
        if (!string.IsNullOrWhiteSpace(payload.LastName)) entries.Add($"last_name={payload.LastName}");
        if (!string.IsNullOrWhiteSpace(payload.PhotoUrl)) entries.Add($"photo_url={payload.PhotoUrl}");
        if (!string.IsNullOrWhiteSpace(payload.Username)) entries.Add($"username={payload.Username}");

        entries.Sort(StringComparer.Ordinal);
        var dataCheckString = string.Join("\n", entries);
        var secretKey = SHA256.HashData(Encoding.UTF8.GetBytes(botToken));

        using var hmac = new HMACSHA256(secretKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(dataCheckString));
        var expectedHash = Convert.ToHexString(hash).ToLowerInvariant();

        return string.Equals(expectedHash, payload.Hash.Trim().ToLowerInvariant(), StringComparison.Ordinal);
    }

    public async Task SendTelegramMessageAsync(long chatId, string text, CancellationToken cancellationToken = default)
    {
        var botToken = await GetTelegramBotTokenAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(botToken))
        {
            return;
        }

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{botToken}/sendMessage")
        {
            Content = JsonContent.Create(new
            {
                chat_id = chatId,
                text
            })
        };

        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            _ = response.IsSuccessStatusCode;
        }
        catch
        {
            // Notification failures should not break auth flow.
        }
    }

    public async Task<bool> SendTelegramDocumentAsync(
        long chatId,
        string filePath,
        string fileName,
        string? caption = null,
        CancellationToken cancellationToken = default)
    {
        var botToken = await GetTelegramBotTokenAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(botToken) || string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return false;
        }

        var client = _httpClientFactory.CreateClient();
        await using var fileStream = File.OpenRead(filePath);
        using var content = new MultipartFormDataContent();
        content.Add(new StringContent(chatId.ToString()), "chat_id");

        if (!string.IsNullOrWhiteSpace(caption))
        {
            content.Add(new StringContent(caption.Trim()), "caption");
        }

        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(streamContent, "document", fileName);

        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://api.telegram.org/bot{botToken}/sendDocument")
        {
            Content = content
        };

        try
        {
            using var response = await client.SendAsync(request, cancellationToken);
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public string BuildAbsoluteUrl(HttpContext httpContext, string relativePath)
    {
        var normalizedPath = relativePath.StartsWith("/", StringComparison.Ordinal)
            ? relativePath
            : "/" + relativePath;

        var scheme = GetProxyHeaderValue(httpContext, "X-Forwarded-Proto") ?? httpContext.Request.Scheme;
        var host = GetProxyHeaderValue(httpContext, "X-Forwarded-Host") ?? httpContext.Request.Host.Value;
        var pathBase = ResolveExternalPathBase(httpContext);

        return $"{scheme}://{host}{pathBase}{normalizedPath}";
    }

    public static string BuildPopupHtml(bool success, string? message)
    {
        var title = success ? "Авторизация завершена" : "Ошибка авторизации";
        var safeTitle = WebUtility.HtmlEncode(title);
        var safeMessage = WebUtility.HtmlEncode(string.IsNullOrWhiteSpace(message) ? "Вернитесь на сайт." : message.Trim());

        return $$"""
<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>{{safeTitle}}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; padding: 24px; color: #27343d; background: linear-gradient(180deg, #fbf4ec, #f3ece6); }
    .card { max-width: 440px; margin: 10vh auto; background: rgba(255,255,255,.92); border-radius: 22px; padding: 28px; box-shadow: 0 18px 60px rgba(39,52,61,.12); }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p { margin: 0; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <h1>{{safeTitle}}</h1>
    <p>{{safeMessage}}</p>
  </div>
  <script>
    setTimeout(function () {
      if (window.opener && !window.opener.closed) {
        window.close();
      }
    }, 1200);
  </script>
</body>
</html>
""";
    }

    private async Task<ExternalProviderConfiguration?> BuildConfigurationAsync(
        string provider,
        string displayName,
        string enabledKey,
        string enabledConfigPath,
        string clientIdKey,
        string clientIdConfigPath,
        string clientSecretKey,
        string clientSecretConfigPath,
        string authorizationEndpoint,
        string tokenEndpoint,
        string userInfoEndpoint,
        string scope,
        CancellationToken cancellationToken)
    {
        var enabled = await _appSettingsService.GetBooleanAsync(enabledKey, false, enabledConfigPath, cancellationToken);
        if (!enabled)
        {
            return null;
        }

        var clientId = await _appSettingsService.GetStringAsync(clientIdKey, clientIdConfigPath, cancellationToken);
        var clientSecret = await _appSettingsService.GetStringAsync(clientSecretKey, clientSecretConfigPath, cancellationToken);
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
        {
            return null;
        }

        return new ExternalProviderConfiguration(
            provider,
            displayName,
            clientId.Trim(),
            clientSecret.Trim(),
            authorizationEndpoint,
            tokenEndpoint,
            userInfoEndpoint,
            scope);
    }

    private async Task SaveOAuthProviderAsync(
        string enabledKey,
        string clientIdKey,
        string clientSecretKey,
        UpdateExternalAuthProviderRequest request,
        CancellationToken cancellationToken)
    {
        await _appSettingsService.UpsertAsync(enabledKey, request.Enabled ? "true" : "false", enabledKey, false, cancellationToken);

        if (request.ClientId is not null)
        {
            await _appSettingsService.UpsertAsync(clientIdKey, request.ClientId, clientIdKey, false, cancellationToken);
        }

        if (request.ClientSecret is not null)
        {
            await _appSettingsService.UpsertAsync(clientSecretKey, request.ClientSecret, clientSecretKey, true, cancellationToken);
        }
    }

    private async Task<ExternalAccessTokenResult> ExchangeAccessTokenAsync(
        ExternalProviderConfiguration configuration,
        string code,
        string redirectUri,
        string? codeVerifier,
        string? deviceId,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = configuration.Provider == "vk"
            ? BuildVkTokenExchangeRequest(configuration, code, redirectUri, codeVerifier, deviceId)
            : new HttpRequestMessage(HttpMethod.Post, configuration.TokenEndpoint)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["grant_type"] = "authorization_code",
                    ["code"] = code,
                    ["client_id"] = configuration.ClientId,
                    ["client_secret"] = configuration.ClientSecret,
                    ["redirect_uri"] = redirectUri
                })
            };

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(GetProviderError(content, response.ReasonPhrase)
                ?? $"Не удалось получить токен {configuration.DisplayName}.");
        }

        using var document = JsonDocument.Parse(content);
        var accessToken = document.RootElement.TryGetProperty("access_token", out var accessTokenElement)
            ? accessTokenElement.GetString()?.Trim()
            : null;
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new InvalidOperationException($"{configuration.DisplayName} не вернул access token.");
        }

        var providerEmail = document.RootElement.TryGetProperty("email", out var emailElement)
            ? emailElement.GetString()?.Trim()
            : null;
        var providerUserId = document.RootElement.TryGetProperty("user_id", out var userIdElement)
            ? userIdElement.ValueKind switch
            {
                JsonValueKind.String => userIdElement.GetString()?.Trim(),
                JsonValueKind.Number => userIdElement.GetInt64().ToString(),
                _ => null
            }
            : null;

        return new ExternalAccessTokenResult(accessToken!, providerEmail, providerUserId);
    }

    private async Task<ExternalIdentityProfile> LoadGoogleProfileAsync(
        string accessToken,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(GetProviderError(content, response.ReasonPhrase) ?? "Google не вернул данные профиля.");
        }

        using var document = JsonDocument.Parse(content);
        var providerUserId = ReadString(document.RootElement, "sub")
            ?? throw new InvalidOperationException("Google не вернул идентификатор пользователя.");
        var email = ReadString(document.RootElement, "email");
        var emailVerified = document.RootElement.TryGetProperty("email_verified", out var emailVerifiedElement) &&
            emailVerifiedElement.ValueKind is JsonValueKind.True or JsonValueKind.False &&
            emailVerifiedElement.GetBoolean();

        return new ExternalIdentityProfile(
            Provider: "google",
            ProviderUserId: providerUserId,
            Email: email,
            EmailVerified: emailVerified,
            Username: null,
            DisplayName: ReadString(document.RootElement, "name"),
            AvatarUrl: ReadString(document.RootElement, "picture"),
            RawProfileJson: content);
    }

    private async Task<ExternalIdentityProfile> LoadVkProfileAsync(
        ExternalProviderConfiguration configuration,
        ExternalAccessTokenResult tokenResult,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            QueryHelpers.AddQueryString(
                configuration.UserInfoEndpoint,
                new Dictionary<string, string?>
                {
                    ["client_id"] = configuration.ClientId
                }))
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["access_token"] = tokenResult.AccessToken
            })
        };

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(GetProviderError(content, response.ReasonPhrase) ?? "VK не вернул данные профиля.");
        }

        using var document = JsonDocument.Parse(content);
        if (!document.RootElement.TryGetProperty("user", out var userElement) || userElement.ValueKind != JsonValueKind.Object)
        {
            throw new InvalidOperationException("VK не вернул данные пользователя.");
        }

        var providerUserId = ReadString(userElement, "user_id", "id") ?? tokenResult.ProviderUserId;
        if (string.IsNullOrWhiteSpace(providerUserId))
        {
            throw new InvalidOperationException("VK не вернул идентификатор пользователя.");
        }

        var firstName = ReadString(userElement, "first_name");
        var lastName = ReadString(userElement, "last_name");
        var displayName = string.Join(" ", new[] { firstName, lastName }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        var avatarUrl = ReadString(userElement, "avatar", "photo_200");
        var email = ReadString(userElement, "email") ?? tokenResult.ProviderEmail;

        return new ExternalIdentityProfile(
            Provider: "vk",
            ProviderUserId: providerUserId,
            Email: email,
            EmailVerified: TechnicalEmailHelper.IsValidRealEmail(email),
            Username: ReadString(userElement, "screen_name"),
            DisplayName: string.IsNullOrWhiteSpace(displayName) ? ReadString(userElement, "screen_name") : displayName,
            AvatarUrl: avatarUrl,
            RawProfileJson: content);
    }

    private async Task<ExternalIdentityProfile> LoadYandexProfileAsync(
        string accessToken,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "https://login.yandex.ru/info?format=json");
        request.Headers.TryAddWithoutValidation("Authorization", $"OAuth {accessToken}");

        using var response = await client.SendAsync(request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException(GetProviderError(content, response.ReasonPhrase) ?? "Yandex не вернул данные профиля.");
        }

        using var document = JsonDocument.Parse(content);
        var providerUserId = ReadString(document.RootElement, "id")
            ?? throw new InvalidOperationException("Yandex не вернул идентификатор пользователя.");

        string? avatarUrl = null;
        var isAvatarEmpty = document.RootElement.TryGetProperty("is_avatar_empty", out var avatarEmptyElement) &&
            avatarEmptyElement.ValueKind is JsonValueKind.True or JsonValueKind.False &&
            avatarEmptyElement.GetBoolean();
        if (!isAvatarEmpty)
        {
            var avatarId = ReadString(document.RootElement, "default_avatar_id");
            if (!string.IsNullOrWhiteSpace(avatarId))
            {
                avatarUrl = $"https://avatars.yandex.net/get-yapic/{avatarId}/islands-200";
            }
        }

        var email = ReadString(document.RootElement, "default_email");

        return new ExternalIdentityProfile(
            Provider: "yandex",
            ProviderUserId: providerUserId,
            Email: email,
            EmailVerified: TechnicalEmailHelper.IsValidRealEmail(email),
            Username: ReadString(document.RootElement, "login"),
            DisplayName: ReadString(document.RootElement, "real_name", "display_name"),
            AvatarUrl: avatarUrl,
            RawProfileJson: content);
    }

    private string ResolveExternalPathBase(HttpContext httpContext)
    {
        var requestPathBase = NormalizePathBase(httpContext.Request.PathBase.Value);
        var forwardedPrefix = NormalizePathBase(GetProxyHeaderValue(httpContext, "X-Forwarded-Prefix"));

        if (string.IsNullOrWhiteSpace(forwardedPrefix))
        {
            return requestPathBase ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(requestPathBase))
        {
            return forwardedPrefix;
        }

        return string.Equals(requestPathBase, forwardedPrefix, StringComparison.Ordinal)
            ? requestPathBase
            : $"{requestPathBase}{forwardedPrefix}";
    }

    private static string? NormalizePathBase(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrWhiteSpace(normalized) || normalized == "/")
        {
            return null;
        }

        if (!normalized.StartsWith("/", StringComparison.Ordinal))
        {
            normalized = "/" + normalized;
        }

        return normalized.TrimEnd('/');
    }

    private static string? GetProxyHeaderValue(HttpContext httpContext, string headerName)
    {
        if (!httpContext.Request.Headers.TryGetValue(headerName, out StringValues values))
        {
            return null;
        }

        var firstValue = values.ToString()
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .FirstOrDefault();

        return string.IsNullOrWhiteSpace(firstValue) ? null : firstValue;
    }

    private static PublicExternalAuthProviderDto BuildPublicProvider(string provider, string mode, bool enabled)
    {
        return new PublicExternalAuthProviderDto
        {
            Provider = provider,
            DisplayName = GetProviderDisplayName(provider),
            Mode = mode,
            Enabled = enabled,
            WidgetEnabled = false
        };
    }

    private static string? GetProviderError(string content, string? fallback)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return fallback;
        }

        try
        {
            using var document = JsonDocument.Parse(content);
            return ReadString(document.RootElement, "error_description", "error", "message") ?? fallback;
        }
        catch
        {
            return fallback;
        }
    }

    private static string? ReadString(JsonElement root, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            if (!root.TryGetProperty(propertyName, out var value))
            {
                continue;
            }

            return value.ValueKind switch
            {
                JsonValueKind.String => value.GetString()?.Trim(),
                JsonValueKind.Number => value.GetInt64().ToString(),
                _ => null
            };
        }

        return null;
    }

    private static HttpRequestMessage BuildVkTokenExchangeRequest(
        ExternalProviderConfiguration configuration,
        string code,
        string redirectUri,
        string? codeVerifier,
        string? deviceId)
    {
        if (string.IsNullOrWhiteSpace(codeVerifier) || string.IsNullOrWhiteSpace(deviceId))
        {
            throw new InvalidOperationException("VK requires PKCE and device id.");
        }

        var requestUri = QueryHelpers.AddQueryString(
            configuration.TokenEndpoint,
            new Dictionary<string, string?>
            {
                ["grant_type"] = "authorization_code",
                ["redirect_uri"] = redirectUri,
                ["client_id"] = configuration.ClientId,
                ["code_verifier"] = codeVerifier,
                ["device_id"] = deviceId
            });

        return new HttpRequestMessage(HttpMethod.Post, requestUri)
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["code"] = code
            })
        };
    }

    private static string BuildVkCodeVerifier()
    {
        Span<byte> bytes = stackalloc byte[32];
        RandomNumberGenerator.Fill(bytes);
        return WebEncoders.Base64UrlEncode(bytes);
    }

    private static string BuildVkCodeChallenge(string codeVerifier)
    {
        var hash = SHA256.HashData(Encoding.ASCII.GetBytes(codeVerifier));
        return WebEncoders.Base64UrlEncode(hash);
    }

    private static IReadOnlyCollection<string> BuildOAuthHints(string provider, string callbackUrl)
    {
        var displayName = GetProviderDisplayName(provider);
        return
        [
            $"В консоли {displayName} создайте web-приложение и вставьте callback URL: {callbackUrl}",
            "Client ID вставляется как есть из консоли провайдера.",
            "Client Secret можно оставить пустым при повторном сохранении, если не хотите менять существующий секрет."
        ];
    }

    private static IReadOnlyCollection<AdminExternalAuthDiagnosticDto> BuildOAuthDiagnostics(
        bool enabled,
        string? clientId,
        string? clientSecret,
        string callbackUrl)
    {
        return
        [
            new()
            {
                Key = "enabled",
                Title = "Провайдер включен",
                Ok = enabled,
                Message = enabled ? "Включен в админке." : "Нужно включить переключатель Enabled."
            },
            new()
            {
                Key = "client_id",
                Title = "Client ID",
                Ok = !string.IsNullOrWhiteSpace(clientId),
                Message = !string.IsNullOrWhiteSpace(clientId) ? "Client ID сохранен." : "Заполните Client ID из консоли провайдера."
            },
            new()
            {
                Key = "client_secret",
                Title = "Client Secret",
                Ok = !string.IsNullOrWhiteSpace(clientSecret),
                Message = !string.IsNullOrWhiteSpace(clientSecret) ? "Client Secret сохранен." : "Заполните Client Secret из консоли провайдера."
            },
            new()
            {
                Key = "callback_url",
                Title = "Callback URL",
                Ok = true,
                Message = callbackUrl
            }
        ];
    }

    private static IReadOnlyCollection<string> BuildTelegramHints(string webhookUrl)
    {
        return
        [
            "Bot username лучше сохранять без символа @.",
            "Для Telegram Widget задайте домен через BotFather командой /setdomain и используйте домен lk.blagodaty.ru.",
            $"Webhook для логин-бота должен смотреть на {webhookUrl}"
        ];
    }

    private static IReadOnlyCollection<AdminExternalAuthDiagnosticDto> BuildTelegramDiagnostics(
        bool enabled,
        bool widgetEnabled,
        string? botUsername,
        string? botToken,
        string? webhookSecret,
        string webhookUrl)
    {
        return
        [
            new()
            {
                Key = "enabled",
                Title = "Telegram login включен",
                Ok = enabled,
                Message = enabled ? "Telegram bot login включен." : "Нужно включить переключатель Enabled."
            },
            new()
            {
                Key = "bot_username",
                Title = "Bot username",
                Ok = !string.IsNullOrWhiteSpace(botUsername),
                Message = !string.IsNullOrWhiteSpace(botUsername) ? $"Используем @{botUsername.Trim().TrimStart('@')}." : "Заполните username логин-бота."
            },
            new()
            {
                Key = "bot_token",
                Title = "Bot token",
                Ok = !string.IsNullOrWhiteSpace(botToken),
                Message = !string.IsNullOrWhiteSpace(botToken) ? "Токен бота сохранен." : "Заполните токен, который выдал BotFather."
            },
            new()
            {
                Key = "widget_enabled",
                Title = "Telegram Widget",
                Ok = !widgetEnabled || !string.IsNullOrWhiteSpace(botUsername),
                Message = widgetEnabled
                    ? "Widget включен. Убедитесь, что lk.blagodaty.ru указан в /setdomain."
                    : "Widget сейчас выключен."
            },
            new()
            {
                Key = "webhook_secret",
                Title = "Webhook secret",
                Ok = !string.IsNullOrWhiteSpace(webhookSecret),
                Message = !string.IsNullOrWhiteSpace(webhookSecret)
                    ? "Webhook secret сохранен."
                    : "Рекомендуется заполнить секрет для заголовка X-Telegram-Bot-Api-Secret-Token."
            },
            new()
            {
                Key = "webhook_url",
                Title = "Webhook URL",
                Ok = true,
                Message = webhookUrl
            }
        ];
    }
}

public sealed record ExternalProviderConfiguration(
    string Provider,
    string DisplayName,
    string ClientId,
    string ClientSecret,
    string AuthorizationEndpoint,
    string TokenEndpoint,
    string UserInfoEndpoint,
    string Scope);

public sealed record ExternalAuthorizationMaterial(string AuthorizationUrl, string? CodeVerifier, string? DeviceId);

public sealed record ExternalAccessTokenResult(string AccessToken, string? ProviderEmail, string? ProviderUserId);

public sealed record TelegramWidgetPayload(
    string Id,
    string? FirstName,
    string? LastName,
    string? Username,
    string? PhotoUrl,
    string AuthDate,
    string Hash);
