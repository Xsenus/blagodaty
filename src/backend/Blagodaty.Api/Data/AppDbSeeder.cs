using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Data;

public static class AppDbSeeder
{
    public static async Task SeedAsync(IServiceProvider services)
    {
        var dbContext = services.GetRequiredService<AppDbContext>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole<Guid>>>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var seedOptions = services.GetRequiredService<IOptions<SeedOptions>>().Value;

        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(role));
            }
        }

        await EnsureExternalAuthSettingsAsync(dbContext);

        if (await userManager.Users.AnyAsync())
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(seedOptions.AdminEmail) || string.IsNullOrWhiteSpace(seedOptions.AdminPassword))
        {
            return;
        }

        var admin = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = seedOptions.AdminEmail,
            Email = seedOptions.AdminEmail,
            FirstName = "Blagodaty",
            LastName = "Admin",
            DisplayName = seedOptions.AdminDisplayName,
            EmailConfirmed = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(admin, seedOptions.AdminPassword);
        if (!result.Succeeded)
        {
            var message = string.Join("; ", result.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Unable to create seeded admin user: {message}");
        }

        var roleResult = await userManager.AddToRolesAsync(admin, [AppRoles.Member, AppRoles.Admin]);
        if (!roleResult.Succeeded)
        {
            var message = string.Join("; ", roleResult.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Unable to assign seeded admin roles: {message}");
        }
    }

    private static async Task EnsureExternalAuthSettingsAsync(AppDbContext dbContext)
    {
        var now = DateTime.UtcNow;
        var defaults = new Dictionary<string, (string? Value, string Description, bool IsSecret)>
        {
            [ExternalAuthSettingKeys.GoogleEnabled] = ("false", "Google OAuth enabled", false),
            [ExternalAuthSettingKeys.GoogleClientId] = (null, "Google OAuth client id", false),
            [ExternalAuthSettingKeys.GoogleClientSecret] = (null, "Google OAuth client secret", true),
            [ExternalAuthSettingKeys.VkEnabled] = ("false", "VK OAuth enabled", false),
            [ExternalAuthSettingKeys.VkClientId] = (null, "VK OAuth client id", false),
            [ExternalAuthSettingKeys.VkClientSecret] = (null, "VK OAuth client secret", true),
            [ExternalAuthSettingKeys.YandexEnabled] = ("false", "Yandex OAuth enabled", false),
            [ExternalAuthSettingKeys.YandexClientId] = (null, "Yandex OAuth client id", false),
            [ExternalAuthSettingKeys.YandexClientSecret] = (null, "Yandex OAuth client secret", true),
            [ExternalAuthSettingKeys.TelegramLoginEnabled] = ("false", "Telegram bot login enabled", false),
            [ExternalAuthSettingKeys.TelegramWidgetEnabled] = ("false", "Telegram widget login enabled", false),
            [ExternalAuthSettingKeys.TelegramBotUsername] = (null, "Telegram bot username", false),
            [ExternalAuthSettingKeys.TelegramBotToken] = (null, "Telegram bot token", true),
            [ExternalAuthSettingKeys.TelegramWebhookSecret] = (null, "Telegram webhook secret", true)
        };

        var existing = await dbContext.AppSettings
            .Where(item => defaults.Keys.Contains(item.Key))
            .ToDictionaryAsync(item => item.Key);

        foreach (var (key, definition) in defaults)
        {
            if (existing.ContainsKey(key))
            {
                continue;
            }

            dbContext.AppSettings.Add(new AppSetting
            {
                Id = Guid.NewGuid(),
                Key = key,
                Value = definition.Value,
                Description = definition.Description,
                IsSecret = definition.IsSecret,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        await dbContext.SaveChangesAsync();
    }
}
