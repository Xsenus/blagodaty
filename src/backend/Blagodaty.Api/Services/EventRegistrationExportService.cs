using Blagodaty.Api.Data;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed class EventRegistrationExportService
{
    private readonly AppDbContext _dbContext;

    public EventRegistrationExportService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<EventRegistrationExportFile?> ExportBySlugAsync(string slug, CancellationToken cancellationToken = default)
    {
        var normalizedSlug = string.IsNullOrWhiteSpace(slug) ? null : slug.Trim();
        if (normalizedSlug is null)
        {
            return null;
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Slug == normalizedSlug, cancellationToken);
        if (eventItem is null)
        {
            return null;
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.SelectedPriceOption)
            .Where(item => item.EventEditionId == eventItem.Id)
            .OrderBy(item => item.Status)
            .ThenBy(item => item.SubmittedAtUtc ?? item.UpdatedAtUtc)
            .ThenBy(item => item.FullName)
            .ToListAsync(cancellationToken);

        var userIds = registrations.Select(item => item.UserId).Distinct().ToArray();
        var telegramByUserId = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(item => item.Provider == "telegram" && userIds.Contains(item.UserId))
            .GroupBy(item => item.UserId)
            .Select(group => new
            {
                UserId = group.Key,
                Username = group
                    .Where(item => item.ProviderUsername != null && item.ProviderUsername != "")
                    .Select(item => item.ProviderUsername)
                    .FirstOrDefault(),
                ChatId = group
                    .Where(item => item.TelegramChatId != null)
                    .Select(item => item.TelegramChatId)
                    .FirstOrDefault()
            })
            .ToDictionaryAsync(
                item => item.UserId,
                item => new TelegramIdentityProjection(item.Username, item.ChatId),
                cancellationToken);

        var workbook = new XLWorkbook();
        var registrationsSheet = workbook.Worksheets.Add("Участники");
        var summarySheet = workbook.Worksheets.Add("Сводка");

        BuildRegistrationsSheet(registrationsSheet, eventItem.Title, registrations, telegramByUserId);
        BuildSummarySheet(summarySheet, eventItem.Title, eventItem.Slug, registrations);

        var exportDirectory = Path.Combine(Path.GetTempPath(), "blagodaty-exports");
        Directory.CreateDirectory(exportDirectory);
        var safeSlug = ToSafeFilePart(eventItem.Slug);
        var timeStamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
        var fileName = $"{safeSlug}-registrations-{timeStamp}.xlsx";
        var filePath = Path.Combine(exportDirectory, fileName);
        workbook.SaveAs(filePath);

        return new EventRegistrationExportFile(filePath, fileName, eventItem.Id, eventItem.Title, registrations.Count);
    }

    private static void BuildRegistrationsSheet(
        IXLWorksheet sheet,
        string eventTitle,
        IReadOnlyList<Models.CampRegistration> registrations,
        IReadOnlyDictionary<Guid, TelegramIdentityProjection> telegramByUserId)
    {
        sheet.Cell(1, 1).Value = $"Экспорт заявок: {eventTitle}";
        sheet.Range(1, 1, 1, 15).Merge().Style.Font.SetBold().Font.SetFontSize(14);

        var headers = new[]
        {
            "№",
            "Статус",
            "ФИО",
            "Email",
            "Телефон",
            "Telegram",
            "Дата рождения",
            "Город",
            "Церковь",
            "Тариф",
            "Размещение",
            "Здоровье / аллергии / особые нужды",
            "Мотивация",
            "Создано",
            "Отправлено"
        };

        for (var index = 0; index < headers.Length; index++)
        {
            sheet.Cell(3, index + 1).Value = headers[index];
        }

        var headerRange = sheet.Range(3, 1, 3, headers.Length);
        headerRange.Style.Font.SetBold();
        headerRange.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#F3E6D8"));

        var rowIndex = 4;
        for (var index = 0; index < registrations.Count; index++, rowIndex++)
        {
            var registration = registrations[index];
            telegramByUserId.TryGetValue(registration.UserId, out var telegram);

            sheet.Cell(rowIndex, 1).Value = index + 1;
            sheet.Cell(rowIndex, 2).Value = FormatRegistrationStatus(registration.Status);
            sheet.Cell(rowIndex, 3).Value = registration.FullName;
            sheet.Cell(rowIndex, 4).Value = registration.User.Email ?? string.Empty;
            sheet.Cell(rowIndex, 5).Value = registration.PhoneNumber;
            sheet.Cell(rowIndex, 6).Value = FormatTelegram(telegram);
            sheet.Cell(rowIndex, 7).Value = registration.BirthDate.ToString("dd.MM.yyyy");
            sheet.Cell(rowIndex, 8).Value = registration.City;
            sheet.Cell(rowIndex, 9).Value = registration.ChurchName;
            sheet.Cell(rowIndex, 10).Value = registration.SelectedPriceOption?.Title ?? string.Empty;
            sheet.Cell(rowIndex, 11).Value = FormatAccommodation(registration.AccommodationPreference);
            sheet.Cell(rowIndex, 12).Value = BuildMedicalNotes(registration);
            sheet.Cell(rowIndex, 13).Value = registration.Motivation ?? string.Empty;
            sheet.Cell(rowIndex, 14).Value = registration.CreatedAtUtc.ToString("dd.MM.yyyy HH:mm");
            sheet.Cell(rowIndex, 15).Value = registration.SubmittedAtUtc?.ToString("dd.MM.yyyy HH:mm") ?? string.Empty;
        }

        sheet.Columns().AdjustToContents(14, 40);
        sheet.Column(12).Width = 40;
        sheet.Column(13).Width = 40;
        sheet.SheetView.FreezeRows(3);
    }

    private static void BuildSummarySheet(
        IXLWorksheet sheet,
        string eventTitle,
        string eventSlug,
        IReadOnlyList<Models.CampRegistration> registrations)
    {
        sheet.Cell(1, 1).Value = "Сводка по событию";
        sheet.Cell(2, 1).Value = "Событие";
        sheet.Cell(2, 2).Value = eventTitle;
        sheet.Cell(3, 1).Value = "Slug";
        sheet.Cell(3, 2).Value = eventSlug;
        sheet.Cell(5, 1).Value = "Всего заявок";
        sheet.Cell(5, 2).Value = registrations.Count;
        sheet.Cell(6, 1).Value = "Черновики";
        sheet.Cell(6, 2).Value = registrations.Count(item => item.Status == Models.RegistrationStatus.Draft);
        sheet.Cell(7, 1).Value = "Отправлено";
        sheet.Cell(7, 2).Value = registrations.Count(item => item.Status == Models.RegistrationStatus.Submitted);
        sheet.Cell(8, 1).Value = "Подтверждено";
        sheet.Cell(8, 2).Value = registrations.Count(item => item.Status == Models.RegistrationStatus.Confirmed);
        sheet.Cell(9, 1).Value = "Отменено";
        sheet.Cell(9, 2).Value = registrations.Count(item => item.Status == Models.RegistrationStatus.Cancelled);

        sheet.Range(1, 1, 1, 2).Style.Font.SetBold().Font.SetFontSize(14);
        sheet.Range(2, 1, 9, 2).Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin);
        sheet.Columns().AdjustToContents();
    }

    private static string BuildMedicalNotes(Models.CampRegistration registration)
    {
        var parts = new[]
        {
            string.IsNullOrWhiteSpace(registration.HealthNotes) ? null : $"Здоровье: {registration.HealthNotes}",
            string.IsNullOrWhiteSpace(registration.AllergyNotes) ? null : $"Аллергии: {registration.AllergyNotes}",
            string.IsNullOrWhiteSpace(registration.SpecialNeeds) ? null : $"Особые нужды: {registration.SpecialNeeds}"
        };

        return string.Join("\n", parts.Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static string FormatTelegram(TelegramIdentityProjection? telegram)
    {
        if (telegram is null)
        {
            return string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(telegram.Username))
        {
            return "@" + telegram.Username.Trim().TrimStart('@');
        }

        return telegram.ChatId?.ToString() ?? string.Empty;
    }

    private static string FormatRegistrationStatus(Models.RegistrationStatus status) => status switch
    {
        Models.RegistrationStatus.Draft => "Черновик",
        Models.RegistrationStatus.Submitted => "Отправлено",
        Models.RegistrationStatus.Confirmed => "Подтверждено",
        Models.RegistrationStatus.Cancelled => "Отменено",
        _ => status.ToString()
    };

    private static string FormatAccommodation(Models.AccommodationPreference preference) => preference switch
    {
        Models.AccommodationPreference.Tent => "Палатка",
        Models.AccommodationPreference.Cabin => "Домик",
        Models.AccommodationPreference.Either => "Без разницы",
        _ => preference.ToString()
    };

    private static string ToSafeFilePart(string value)
    {
        var invalidChars = Path.GetInvalidFileNameChars();
        var chars = value.Select(ch => invalidChars.Contains(ch) ? '-' : ch).ToArray();
        return new string(chars);
    }

    private sealed record TelegramIdentityProjection(string? Username, long? ChatId);
}

public sealed record EventRegistrationExportFile(
    string FilePath,
    string FileName,
    Guid EventEditionId,
    string EventTitle,
    int RegistrationsCount);
