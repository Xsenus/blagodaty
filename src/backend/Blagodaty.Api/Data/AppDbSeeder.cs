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
        var campOptions = services.GetRequiredService<IOptions<CampOptions>>().Value;

        foreach (var role in AppRoles.All)
        {
            if (!await roleManager.RoleExistsAsync(role))
            {
                await roleManager.CreateAsync(new IdentityRole<Guid>(role));
            }
        }

        await EnsureExternalAuthSettingsAsync(dbContext);
        await EnsureDefaultCampEventAsync(dbContext, campOptions);
        await AttachLegacyRegistrationsAsync(dbContext);

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

    private static async Task EnsureDefaultCampEventAsync(AppDbContext dbContext, CampOptions campOptions)
    {
        var now = DateTime.UtcNow;
        const string defaultSeriesSlug = "blagodaty-camp";
        var startsAtUtc = NormalizeConfiguredUtc(campOptions.StartsAtUtc);
        var endsAtUtc = NormalizeConfiguredUtc(campOptions.EndsAtUtc);
        var registrationOpensAtUtc = NormalizeConfiguredUtc(campOptions.RegistrationOpensAtUtc);
        var registrationClosesAtUtc = NormalizeConfiguredUtc(campOptions.RegistrationClosesAtUtc);
        var series = await dbContext.EventSeries
            .FirstOrDefaultAsync(item => item.Slug == defaultSeriesSlug);

        if (series is null)
        {
            series = new EventSeries
            {
                Id = Guid.NewGuid(),
                Slug = defaultSeriesSlug,
                Title = string.IsNullOrWhiteSpace(campOptions.Name) ? "Blagodaty Camp" : campOptions.Name.Trim(),
                Kind = EventKind.Camp,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            dbContext.EventSeries.Add(series);
        }

        var year = startsAtUtc == default ? DateTime.UtcNow.Year : startsAtUtc.Year;
        var editionSlug = $"{defaultSeriesSlug}-{year}";
        var edition = await dbContext.EventEditions
            .Include(item => item.PriceOptions)
            .Include(item => item.ScheduleItems)
            .Include(item => item.ContentBlocks)
            .FirstOrDefaultAsync(item => item.Slug == editionSlug);

        if (edition is null)
        {
            edition = new EventEdition
            {
                Id = Guid.NewGuid(),
                EventSeriesId = series.Id,
                Slug = editionSlug,
                Title = BuildCampEditionTitle(campOptions, year),
                SeasonLabel = string.IsNullOrWhiteSpace(campOptions.Season) ? $"Сезон {year}" : campOptions.Season.Trim(),
                ShortDescription = string.IsNullOrWhiteSpace(campOptions.Tagline)
                    ? "Горный лагерь с церковной командой, общением, молитвой и временем для перезагрузки."
                    : campOptions.Tagline.Trim(),
                FullDescription = string.IsNullOrWhiteSpace(campOptions.Tagline) ? null : campOptions.Tagline.Trim(),
                Location = string.IsNullOrWhiteSpace(campOptions.Location) ? null : campOptions.Location.Trim(),
                Timezone = "Asia/Novosibirsk",
                Status = EventEditionStatus.RegistrationOpen,
                StartsAtUtc = startsAtUtc == default ? new DateTime(year, 7, 15, 8, 0, 0, DateTimeKind.Utc) : startsAtUtc,
                EndsAtUtc = endsAtUtc == default ? new DateTime(year, 7, 23, 8, 0, 0, DateTimeKind.Utc) : endsAtUtc,
                RegistrationOpensAtUtc = registrationOpensAtUtc,
                RegistrationClosesAtUtc = registrationClosesAtUtc,
                Capacity = campOptions.Capacity,
                WaitlistEnabled = campOptions.WaitlistEnabled,
                SortOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            edition.PriceOptions.Add(new EventPriceOption
            {
                Id = Guid.NewGuid(),
                Code = "standard",
                Title = "Стандартное участие",
                Description = "Базовый тариф для участия в лагере.",
                Amount = campOptions.SuggestedDonation,
                Currency = "RUB",
                IsDefault = true,
                IsActive = true,
                SortOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });

            edition.ScheduleItems.Add(new EventScheduleItem
            {
                Id = Guid.NewGuid(),
                Title = "Заезд и размещение",
                Kind = EventScheduleItemKind.Arrival,
                StartsAtUtc = edition.StartsAtUtc,
                EndsAtUtc = edition.StartsAtUtc.AddHours(6),
                Location = edition.Location,
                SortOrder = 0
            });

            edition.ScheduleItems.Add(new EventScheduleItem
            {
                Id = Guid.NewGuid(),
                Title = "Основная программа лагеря",
                Kind = EventScheduleItemKind.MainProgram,
                StartsAtUtc = edition.StartsAtUtc.AddHours(6),
                EndsAtUtc = edition.EndsAtUtc.AddHours(-6),
                Location = edition.Location,
                SortOrder = 10
            });

            edition.ScheduleItems.Add(new EventScheduleItem
            {
                Id = Guid.NewGuid(),
                Title = "Отъезд",
                Kind = EventScheduleItemKind.Departure,
                StartsAtUtc = edition.EndsAtUtc.AddHours(-6),
                EndsAtUtc = edition.EndsAtUtc,
                Location = edition.Location,
                SortOrder = 20
            });

            var contentBlocks = new[]
            {
                (EventContentBlockType.Hero, "О событии", string.IsNullOrWhiteSpace(campOptions.Tagline)
                    ? "Тихий отдых, молитва, братское общение и горный воздух Алтая."
                    : campOptions.Tagline.Trim(), 0),
                (EventContentBlockType.Highlight, (string?)null, "Походы и выезды в горы Алтая вместе с церковной командой.", 10),
                (EventContentBlockType.Highlight, (string?)null, "Палатки, домики, костры и теплые вечерние встречи под открытым небом.", 20),
                (EventContentBlockType.Highlight, (string?)null, "Поклонение, молитва, наставничество и живое братское общение.", 30),
                (EventContentBlockType.WhatToBring, (string?)null, "Спальник, коврик, фонарик и базовую походную одежду.", 40),
                (EventContentBlockType.WhatToBring, (string?)null, "Средства личной гигиены, теплые вещи и дождевик.", 50),
                (EventContentBlockType.WhatToBring, (string?)null, "Библию, блокнот, ручку и открытое сердце к Богу и людям.", 60)
            };

            foreach (var (blockType, title, body, sortOrder) in contentBlocks)
            {
                edition.ContentBlocks.Add(new EventContentBlock
                {
                    Id = Guid.NewGuid(),
                    BlockType = blockType,
                    Title = title,
                    Body = body,
                    SortOrder = sortOrder,
                    IsPublished = true
                });
            }

            dbContext.EventEditions.Add(edition);
            await dbContext.SaveChangesAsync();
        }
    }

    private static async Task AttachLegacyRegistrationsAsync(AppDbContext dbContext)
    {
        var activeCampEditionId = await dbContext.EventEditions
            .Where(item =>
                item.EventSeries.Kind == EventKind.Camp &&
                item.EventSeries.IsActive &&
                item.Status != EventEditionStatus.Draft &&
                item.Status != EventEditionStatus.Archived)
            .OrderByDescending(item => item.StartsAtUtc)
            .Select(item => (Guid?)item.Id)
            .FirstOrDefaultAsync();

        if (activeCampEditionId is null)
        {
            return;
        }

        var legacyRegistrations = await dbContext.CampRegistrations
            .Where(item => item.EventEditionId == null)
            .ToListAsync();

        if (legacyRegistrations.Count == 0)
        {
            return;
        }

        foreach (var registration in legacyRegistrations)
        {
            registration.EventEditionId = activeCampEditionId.Value;
        }

        await dbContext.SaveChangesAsync();
    }

    private static string BuildCampEditionTitle(CampOptions campOptions, int year)
    {
        if (!string.IsNullOrWhiteSpace(campOptions.Name) && !string.IsNullOrWhiteSpace(campOptions.Season))
        {
            return $"{campOptions.Name.Trim()} {campOptions.Season.Trim()}";
        }

        return $"Blagodaty Camp {year}";
    }

    private static DateTime NormalizeConfiguredUtc(DateTime value)
    {
        if (value == default)
        {
            return value;
        }

        return value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
    }

    private static DateTime? NormalizeConfiguredUtc(DateTime? value)
    {
        return value.HasValue ? NormalizeConfiguredUtc(value.Value) : null;
    }
}
