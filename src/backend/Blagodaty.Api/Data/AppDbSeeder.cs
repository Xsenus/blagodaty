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
    private const string Camp2026ContentVersion = "2026-05-13-premium-program-v4";
    private const decimal Camp2026PriceAmount = 18_000m;
    private const int Camp2026Capacity = 35;
    private const string Camp2026Tagline = "Палаточный лагерь в Горном Алтае: горы, молитва, живое общение и продуманный общий ритм.";

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
                Description = "Палаточный лагерь в Горном Алтае. Заявка до 10.07, оплата до 13.07.",
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
                Title = "Основные дни лагеря",
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
                Location = "Координатор оплаты",
                Notes = "Оплату вносим до 13.07, чтобы команда закрепила место и заранее подготовила участие.",
                SortOrder = -10
            });

            var contentBlocks = new[]
            {
                (EventContentBlockType.Hero, "О событии", string.IsNullOrWhiteSpace(campOptions.Tagline)
                    ? "Тихий отдых, молитва, братское общение и горный воздух Алтая."
                    : campOptions.Tagline.Trim(), 0),
                (EventContentBlockType.Highlight, (string?)null, "Шесть дней в Горном Алтае: палаточный лагерь среди Курайской степи, горный воздух, молитва и живое общение без городской суеты.", 10),
                (EventContentBlockType.Highlight, (string?)null, "Камерный формат до 35 участников с 16 лет: общий ритм, внимательная команда и пространство, где легко быть частью лагеря.", 20),
                (EventContentBlockType.Highlight, (string?)null, "Место закрепляется после заявки до 10.07 и оплаты до 13.07, чтобы команда заранее подготовила размещение, питание и программу.", 30),
                (EventContentBlockType.WhatToBring, "Сон и тепло", "Спальник по погоде, туристический коврик, маленькая подушка и удобная пижама.", 40),
                (EventContentBlockType.WhatToBring, "Одежда слоями", "Футболки, удобные штаны, теплая кофта, куртка, теплые носки и тонкая шапка для вечера.", 50),
                (EventContentBlockType.WhatToBring, "Обувь", "Надежные кроссовки или треккинговая пара для прогулок и резиновые сапоги на случай дождя.", 60),
                (EventContentBlockType.WhatToBring, "Гигиена", "Зубная щетка, паста, шампунь, влажные салфетки, полотенце для лица и сменное белье.", 70),
                (EventContentBlockType.WhatToBring, "Солнце и вода", "Головной убор, солнцезащитный крем и пляжное полотенце для теплых дневных выходов.", 80),
                (EventContentBlockType.WhatToBring, "Дождь", "Дождевик и большие плотные пакеты, чтобы быстро защитить вещи от влаги.", 90),
                (EventContentBlockType.WhatToBring, "Вечер и лагерь", "Фонарик обязательно, средство от насекомых и несколько подарков для игры «Тайный друг».", 100),
                (EventContentBlockType.WhatToBring, "Для встреч", "Библия, ручка, блокнот или тетрадь для заметок и общих разборов.", 110),
                (EventContentBlockType.ImportantNotice, "Ответственность за вещи", "Ценные вещи лучше оставить дома или держать при себе: походный формат живой и общий, поэтому каждый отвечает за свои документы, деньги и технику.", 120),
                (EventContentBlockType.ImportantNotice, "Запрещено привозить", "На территорию не привозим и не употребляем алкоголь, табак и наркотические вещества. Сохраняем пространство лагеря трезвым, чистым и безопасным для всех.", 130),
                (EventContentBlockType.ImportantNotice, "Правила поведения", "Живем по общему расписанию, бережно относимся к людям и территории, не уединяемся разнополыми парами и следуем указаниям служительской команды.", 140)
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
        dbContext.ChangeTracker.Clear();

        var versionSetting = await dbContext.AppSettings.FirstOrDefaultAsync(item => item.Key == Camp2026ContentVersionKey);
        if (versionSetting?.Value == Camp2026ContentVersion)
        {
            return;
        }

        var now = DateTime.UtcNow;
        var registrationOpensAtUtc = NormalizeConfiguredUtc(campOptions.RegistrationOpensAtUtc);
        const int year = 2026;
        var editionSlug = $"blagodaty-camp-{year}";
        var edition = await dbContext.EventEditions
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Slug == editionSlug);
        if (edition is null)
        {
            return;
        }

        edition.Title = BuildCampEditionTitle(campOptions, year);
        edition.SeasonLabel = string.IsNullOrWhiteSpace(campOptions.Season) ? $"Сезон {year}" : campOptions.Season.Trim();
        edition.ShortDescription = Camp2026Tagline;
        edition.FullDescription = edition.ShortDescription;
        edition.Location = string.IsNullOrWhiteSpace(campOptions.Location) ? "Горный Алтай" : campOptions.Location.Trim();
        edition.Timezone = "Asia/Novosibirsk";
        edition.Status = EventEditionStatus.RegistrationOpen;
        edition.StartsAtUtc = new DateTime(year, 8, 17, 8, 0, 0, DateTimeKind.Utc);
        edition.EndsAtUtc = new DateTime(year, 8, 22, 8, 0, 0, DateTimeKind.Utc);
        edition.RegistrationOpensAtUtc = registrationOpensAtUtc;
        edition.RegistrationClosesAtUtc = new DateTime(year, 7, 10, 16, 59, 0, DateTimeKind.Utc);
        edition.Capacity = Camp2026Capacity;
        edition.WaitlistEnabled = campOptions.WaitlistEnabled;
        edition.UpdatedAtUtc = now;

        var priceOptions = await dbContext.EventPriceOptions
            .Where(item => item.EventEditionId == edition.Id)
            .ToListAsync();
        var defaultPrice = priceOptions
            .OrderByDescending(item => item.IsDefault)
            .ThenBy(item => item.SortOrder)
            .FirstOrDefault();
        if (defaultPrice is null)
        {
            defaultPrice = new EventPriceOption
            {
                Id = Guid.NewGuid(),
                EventEditionId = edition.Id,
                CreatedAtUtc = now
            };
            priceOptions.Add(defaultPrice);
            dbContext.EventPriceOptions.Add(defaultPrice);
        }

        foreach (var option in priceOptions)
        {
            option.IsDefault = option.Id == defaultPrice.Id;
        }

        defaultPrice.Code = "standard";
        defaultPrice.Title = "Стандартное участие";
        defaultPrice.Description = "Палаточный лагерь в Горном Алтае. Заявка до 10.07, оплата до 13.07.";
        defaultPrice.Amount = Camp2026PriceAmount;
        defaultPrice.Currency = "RUB";
        defaultPrice.IsActive = true;
        defaultPrice.SortOrder = 0;
        defaultPrice.UpdatedAtUtc = now;

        await dbContext.EventScheduleItems
            .Where(item => item.EventEditionId == edition.Id)
            .ExecuteDeleteAsync();
        AddDefaultCampScheduleItems(edition, year);
        foreach (var scheduleItem in edition.ScheduleItems)
        {
            scheduleItem.EventEditionId = edition.Id;
            dbContext.Entry(scheduleItem).State = EntityState.Added;
        }

        await dbContext.EventContentBlocks
            .Where(item => item.EventEditionId == edition.Id)
            .ExecuteDeleteAsync();
        AddDefaultCampContentBlocks(edition, campOptions);
        foreach (var contentBlock in edition.ContentBlocks)
        {
            contentBlock.EventEditionId = edition.Id;
            dbContext.Entry(contentBlock).State = EntityState.Added;
        }

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
            Location = "Координатор оплаты",
            Notes = "Оплату вносим до 13.07, чтобы команда закрепила место и заранее подготовила участие.",
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
            Title = "Основные дни лагеря",
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
            (EventContentBlockType.Hero, "О событии", Camp2026Tagline, 0),
            (EventContentBlockType.Highlight, (string?)null, "Шесть дней в Горном Алтае: палаточный лагерь среди Курайской степи, горный воздух, молитва и живое общение без городской суеты.", 10),
            (EventContentBlockType.Highlight, (string?)null, "Камерный формат до 35 участников с 16 лет: общий ритм, внимательная команда и пространство, где легко быть частью лагеря.", 20),
            (EventContentBlockType.Highlight, (string?)null, "Место закрепляется после заявки до 10.07 и оплаты до 13.07, чтобы команда заранее подготовила размещение, питание и программу.", 30),
            (EventContentBlockType.WhatToBring, "Сон и тепло", "Спальник по погоде, туристический коврик, маленькая подушка и удобная пижама.", 40),
            (EventContentBlockType.WhatToBring, "Одежда слоями", "Футболки, удобные штаны, теплая кофта, куртка, теплые носки и тонкая шапка для вечера.", 50),
            (EventContentBlockType.WhatToBring, "Обувь", "Надежные кроссовки или треккинговая пара для прогулок и резиновые сапоги на случай дождя.", 60),
            (EventContentBlockType.WhatToBring, "Гигиена", "Зубная щетка, паста, шампунь, влажные салфетки, полотенце для лица и сменное белье.", 70),
            (EventContentBlockType.WhatToBring, "Солнце и вода", "Головной убор, солнцезащитный крем и пляжное полотенце для теплых дневных выходов.", 80),
            (EventContentBlockType.WhatToBring, "Дождь", "Дождевик и большие плотные пакеты, чтобы быстро защитить вещи от влаги.", 90),
            (EventContentBlockType.WhatToBring, "Вечер и лагерь", "Фонарик обязательно, средство от насекомых и несколько подарков для игры «Тайный друг».", 100),
            (EventContentBlockType.WhatToBring, "Для встреч", "Библия, ручка, блокнот или тетрадь для заметок и общих разборов.", 110),
            (EventContentBlockType.ImportantNotice, "Ответственность за вещи", "Ценные вещи лучше оставить дома или держать при себе: походный формат живой и общий, поэтому каждый отвечает за свои документы, деньги и технику.", 120),
            (EventContentBlockType.ImportantNotice, "Запрещено привозить", "На территорию не привозим и не употребляем алкоголь, табак и наркотические вещества. Сохраняем пространство лагеря трезвым, чистым и безопасным для всех.", 130),
            (EventContentBlockType.ImportantNotice, "Правила поведения", "Живем по общему расписанию, бережно относимся к людям и территории, не уединяемся разнополыми парами и следуем указаниям служительской команды.", 140)
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
