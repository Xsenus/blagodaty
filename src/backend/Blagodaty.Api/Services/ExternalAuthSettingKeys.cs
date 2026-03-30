namespace Blagodaty.Api.Services;

public static class ExternalAuthSettingKeys
{
    public const string GoogleEnabled = "google_login_enabled";
    public const string GoogleClientId = "google_auth_client_id";
    public const string GoogleClientSecret = "google_auth_client_secret";

    public const string VkEnabled = "vk_login_enabled";
    public const string VkClientId = "vk_auth_client_id";
    public const string VkClientSecret = "vk_auth_client_secret";

    public const string YandexEnabled = "yandex_login_enabled";
    public const string YandexClientId = "yandex_auth_client_id";
    public const string YandexClientSecret = "yandex_auth_client_secret";

    public const string TelegramLoginEnabled = "telegram_login_enabled";
    public const string TelegramWidgetEnabled = "telegram_widget_enabled";
    public const string TelegramBotUsername = "telegram_bot_username";
    public const string TelegramBotToken = "telegram_bot_token";
    public const string TelegramWebhookSecret = "telegram_webhook_secret";

    public static IReadOnlyCollection<string> All { get; } =
    [
        GoogleEnabled,
        GoogleClientId,
        GoogleClientSecret,
        VkEnabled,
        VkClientId,
        VkClientSecret,
        YandexEnabled,
        YandexClientId,
        YandexClientSecret,
        TelegramLoginEnabled,
        TelegramWidgetEnabled,
        TelegramBotUsername,
        TelegramBotToken,
        TelegramWebhookSecret
    ];
}
