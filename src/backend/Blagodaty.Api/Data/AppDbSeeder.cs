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
    private const string Camp2026ContentVersionKey = "blagodaty_camp_2026_content_version";
    private const string Camp2026ContentVersion = "2026-05-12-august-tent-hike";

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
        await EnsureCurrentCamp2026ContentAsync(dbContext, campOptions);
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
            [ExternalAuthSettingKeys.TelegramWebhookSecret] = (null, "Telegram webhook secret", true),
            [DatabaseBackupSettingKeys.Enabled] = ("false", "Database backups enabled", false),
            [DatabaseBackupSettingKeys.ScheduleLocal] = ("03:00", "Database backup local schedule", false),
            [DatabaseBackupSettingKeys.RetentionDays] = ("14", "Database backup retention days", false),
            [DatabaseBackupSettingKeys.TelegramDeliveryEnabled] = ("false", "Send database backups to Telegram admins", false),
            [DatabaseBackupSettingKeys.Directory] = (null, "Database backup directory", false),
            [DatabaseBackupSettingKeys.PgDumpPath] = (null, "Database backup pg_dump command", false)
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
                StartsAtUtc = startsAtUtc == default ? new DateTime(year, 8, 17, 8, 0, 0, DateTimeKind.Utc) : startsAtUtc,
                EndsAtUtc = endsAtUtc == default ? new DateTime(year, 8, 22, 8, 0, 0, DateTimeKind.Utc) : endsAtUtc,
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
                Description = "Палаточный поход. Регистрация до 10.07, оплата до 13.07.",
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

            edition.ScheduleItems.Add(new EventScheduleItem
            {
                Id = Guid.NewGuid(),
                Title = "Оплата участия",
                Kind = EventScheduleItemKind.Deadline,
                StartsAtUtc = new DateTime(year, 7, 13, 16, 59, 0, DateTimeKind.Utc),
                EndsAtUtc = new DateTime(year, 7, 13, 16, 59, 0, DateTimeKind.Utc),
                Location = "Google Таблица / координатор",
                Notes = "Оплату нужно внести до 13.07.",
                SortOrder = -10
            });

            var contentBlocks = new[]
            {
                (EventContentBlockType.Hero, "О событии", string.IsNullOrWhiteSpace(campOptions.Tagline)
                    ? "Тихий отдых, молитва, братское общение и горный воздух Алтая."
                    : campOptions.Tagline.Trim(), 0),
                (EventContentBlockType.Highlight, (string?)null, "Палаточный поход в Горном Алтае с 17 по 22 августа.", 10),
                (EventContentBlockType.Highlight, (string?)null, "Возраст участников: с 16 лет. Количество мест ограничено: 35.", 20),
                (EventContentBlockType.Highlight, (string?)null, "Регистрация открыта до 10.07, оплату нужно внести до 13.07.", 30),
                (EventContentBlockType.WhatToBring, "Для сна", "Спальник; туристический коврик; маленькая подушка; пижама.", 40),
                (EventContentBlockType.WhatToBring, "Гигиена", "Средства гигиены (зубная щетка, паста, шампунь, влажные салфетки и т. п.); полотенце для лица; сменное нижнее белье.", 50),
                (EventContentBlockType.WhatToBring, "Для активного отдыха", "Пляжное полотенце; головной убор; удобная одежда; удобная обувь; солнцезащитный крем.", 60),
                (EventContentBlockType.WhatToBring, "На случай дождя", "Дождевик; резиновые сапоги; большие черные пакеты, чтобы убрать вещи и защитить их от воды.", 70),
                (EventContentBlockType.WhatToBring, "На прохладную погоду", "Теплая кофта или толстовка с длинным рукавом; теплые носки; куртка; тонкая шапка.", 80),
                (EventContentBlockType.WhatToBring, "Прочее", "Средство от насекомых; фонарик обязательно; несколько подарков для игры «Тайный друг».", 90),
                (EventContentBlockType.WhatToBring, "Канцелярия", "Библия; ручка; блокнот или тетрадка.", 100),
                (EventContentBlockType.ImportantNotice, "Ответственность за вещи", "За сохранность ценных вещей участники самостоятельно несут ответственность.", 110),
                (EventContentBlockType.ImportantNotice, "Запрещено привозить", "На территорию запрещено привозить спиртное и табачные изделия.", 120),
                (EventContentBlockType.ImportantNotice, "Правила поведения", "Запрещено уединение разнополых людей; обязательно строгое соблюдение общего распорядка; запрещено употребление алкогольных, табачных и наркотических веществ; необходимо соблюдать указания служительского состава.", 130)
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

    private static async Task EnsureCurrentCamp2026ContentAsync(AppDbContext dbContext, CampOptions campOptions)
    {
        var versionSetting = await dbContext.AppSettings.FirstOrDefaultAsync(item => item.Key == Camp2026ContentVersionKey);
        if (versionSetting?.Value == Camp2026ContentVersion)
        {
            return;
        }

        var now = DateTime.UtcNow;
        var startsAtUtc = NormalizeConfiguredUtc(campOptions.StartsAtUtc);
        var endsAtUtc = NormalizeConfiguredUtc(campOptions.EndsAtUtc);
        var registrationOpensAtUtc = NormalizeConfiguredUtc(campOptions.RegistrationOpensAtUtc);
        var registrationClosesAtUtc = NormalizeConfiguredUtc(campOptions.RegistrationClosesAtUtc);
        var year = startsAtUtc == default ? 2026 : startsAtUtc.Year;
        var editionSlug = $"blagodaty-camp-{year}";
        var edition = await dbContext.EventEditions
            .Include(item => item.EventSeries)
            .Include(item => item.PriceOptions)
            .Include(item => item.ScheduleItems)
            .Include(item => item.ContentBlocks)
            .FirstOrDefaultAsync(item => item.Slug == editionSlug);
        if (edition is null)
        {
            return;
        }

        edition.Title = BuildCampEditionTitle(campOptions, year);
        edition.SeasonLabel = string.IsNullOrWhiteSpace(campOptions.Season) ? $"Сезон {year}" : campOptions.Season.Trim();
        edition.ShortDescription = string.IsNullOrWhiteSpace(campOptions.Tagline)
            ? "Палаточный поход в Горном Алтае: природа, общение, молитва и общий распорядок."
            : campOptions.Tagline.Trim();
        edition.FullDescription = edition.ShortDescription;
        edition.Location = string.IsNullOrWhiteSpace(campOptions.Location) ? "Горный Алтай" : campOptions.Location.Trim();
        edition.Timezone = "Asia/Novosibirsk";
        edition.Status = EventEditionStatus.RegistrationOpen;
        edition.StartsAtUtc = startsAtUtc == default ? new DateTime(year, 8, 17, 8, 0, 0, DateTimeKind.Utc) : startsAtUtc;
        edition.EndsAtUtc = endsAtUtc == default ? new DateTime(year, 8, 22, 8, 0, 0, DateTimeKind.Utc) : endsAtUtc;
        edition.RegistrationOpensAtUtc = registrationOpensAtUtc;
        edition.RegistrationClosesAtUtc = registrationClosesAtUtc ?? new DateTime(year, 7, 10, 16, 59, 0, DateTimeKind.Utc);
        edition.Capacity = campOptions.Capacity ?? 35;
        edition.WaitlistEnabled = campOptions.WaitlistEnabled;
        edition.UpdatedAtUtc = now;

        var defaultPrice = edition.PriceOptions
            .OrderByDescending(item => item.IsDefault)
            .ThenBy(item => item.SortOrder)
            .FirstOrDefault();
        if (defaultPrice is null)
        {
            defaultPrice = new EventPriceOption
            {
                Id = Guid.NewGuid(),
                CreatedAtUtc = now
            };
            edition.PriceOptions.Add(defaultPrice);
        }

        foreach (var option in edition.PriceOptions)
        {
            option.IsDefault = option.Id == defaultPrice.Id;
        }

        defaultPrice.Code = "standard";
        defaultPrice.Title = "Стандартное участие";
        defaultPrice.Description = "Палаточный поход. Регистрация до 10.07, оплата до 13.07.";
        defaultPrice.Amount = campOptions.SuggestedDonation == 0 ? 18000 : campOptions.SuggestedDonation;
        defaultPrice.Currency = "RUB";
        defaultPrice.IsActive = true;
        defaultPrice.SortOrder = 0;
        defaultPrice.UpdatedAtUtc = now;

        dbContext.EventScheduleItems.RemoveRange(edition.ScheduleItems);
        edition.ScheduleItems.Clear();
        AddDefaultCampScheduleItems(edition, year);

        dbContext.EventContentBlocks.RemoveRange(edition.ContentBlocks);
        edition.ContentBlocks.Clear();
        AddDefaultCampContentBlocks(edition, campOptions);

        if (versionSetting is null)
        {
            dbContext.AppSettings.Add(new AppSetting
            {
                Id = Guid.NewGuid(),
                Key = Camp2026ContentVersionKey,
                Value = Camp2026ContentVersion,
                Description = "Default camp 2026 content update version",
                IsSecret = false,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }
        else
        {
            versionSetting.Value = Camp2026ContentVersion;
            versionSetting.UpdatedAtUtc = now;
        }

        await dbContext.SaveChangesAsync();
    }

    private static void AddDefaultCampScheduleItems(EventEdition edition, int year)
    {
        edition.ScheduleItems.Add(new EventScheduleItem
        {
            Id = Guid.NewGuid(),
            Title = "Оплата участия",
            Kind = EventScheduleItemKind.Deadline,
            StartsAtUtc = new DateTime(year, 7, 13, 16, 59, 0, DateTimeKind.Utc),
            EndsAtUtc = new DateTime(year, 7, 13, 16, 59, 0, DateTimeKind.Utc),
            Location = "Google Таблица / координатор",
            Notes = "Оплату нужно внести до 13.07.",
            SortOrder = -10
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
            Title = "Основная программа похода",
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
    }

    private static void AddDefaultCampContentBlocks(EventEdition edition, CampOptions campOptions)
    {
        var contentBlocks = new[]
        {
            (EventContentBlockType.Hero, "О событии", string.IsNullOrWhiteSpace(campOptions.Tagline)
                ? "Палаточный поход в Горном Алтае: природа, общение, молитва и общий распорядок."
                : campOptions.Tagline.Trim(), 0),
            (EventContentBlockType.Highlight, (string?)null, "Палаточный поход в Горном Алтае с 17 по 22 августа.", 10),
            (EventContentBlockType.Highlight, (string?)null, "Возраст участников: с 16 лет. Количество мест ограничено: 35.", 20),
            (EventContentBlockType.Highlight, (string?)null, "Регистрация открыта до 10.07, оплату нужно внести до 13.07.", 30),
            (EventContentBlockType.WhatToBring, "Для сна", "Спальник; туристический коврик; маленькая подушка; пижама.", 40),
            (EventContentBlockType.WhatToBring, "Гигиена", "Средства гигиены (зубная щетка, паста, шампунь, влажные салфетки и т. п.); полотенце для лица; сменное нижнее белье.", 50),
            (EventContentBlockType.WhatToBring, "Для активного отдыха", "Пляжное полотенце; головной убор; удобная одежда; удобная обувь; солнцезащитный крем.", 60),
            (EventContentBlockType.WhatToBring, "На случай дождя", "Дождевик; резиновые сапоги; большие черные пакеты, чтобы убрать вещи и защитить их от воды.", 70),
            (EventContentBlockType.WhatToBring, "На прохладную погоду", "Теплая кофта или толстовка с длинным рукавом; теплые носки; куртка; тонкая шапка.", 80),
            (EventContentBlockType.WhatToBring, "Прочее", "Средство от насекомых; фонарик обязательно; несколько подарков для игры «Тайный друг».", 90),
            (EventContentBlockType.WhatToBring, "Канцелярия", "Библия; ручка; блокнот или тетрадка.", 100),
            (EventContentBlockType.ImportantNotice, "Ответственность за вещи", "За сохранность ценных вещей участники самостоятельно несут ответственность.", 110),
            (EventContentBlockType.ImportantNotice, "Запрещено привозить", "На территорию запрещено привозить спиртное и табачные изделия.", 120),
            (EventContentBlockType.ImportantNotice, "Правила поведения", "Запрещено уединение разнополых людей; обязательно строгое соблюдение общего распорядка; запрещено употребление алкогольных, табачных и наркотических веществ; необходимо соблюдать указания служительского состава.", 130)
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
