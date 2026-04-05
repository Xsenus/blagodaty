using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
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
            .Include(item => item.Participants)
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

        using var workbook = new XLWorkbook();
        var registrationsSheet = workbook.Worksheets.Add("Заявки");
        var participantsSheet = workbook.Worksheets.Add("Участники");
        var summarySheet = workbook.Worksheets.Add("Сводка");

        BuildRegistrationsSheet(registrationsSheet, eventItem.Title, registrations, telegramByUserId);
        BuildParticipantsSheet(participantsSheet, eventItem.Title, registrations);
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
        IReadOnlyList<CampRegistration> registrations,
        IReadOnlyDictionary<Guid, TelegramIdentityProjection> telegramByUserId)
    {
        sheet.Cell(1, 1).Value = $"Экспорт заявок: {eventTitle}";
        sheet.Range(1, 1, 1, 19).Merge().Style.Font.SetBold().Font.SetFontSize(14);

        var headers = new[]
        {
            "№",
            "Статус",
            "Контактное лицо",
            "Email",
            "Телефон",
            "Участников",
            "Есть дети",
            "Есть автомобиль",
            "Telegram",
            "Дата рождения",
            "Город",
            "Церковь",
            "Тариф",
            "Размещение",
            "Состав группы",
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
            sheet.Cell(rowIndex, 4).Value = !string.IsNullOrWhiteSpace(registration.ContactEmail)
                ? registration.ContactEmail
                : TechnicalEmailHelper.ToVisibleEmail(registration.User.Email);
            sheet.Cell(rowIndex, 5).Value = registration.PhoneNumber;
            sheet.Cell(rowIndex, 6).Value = EventRegistrationService.GetParticipantsCount(registration);
            sheet.Cell(rowIndex, 7).Value = registration.HasChildren ? "Да" : "Нет";
            sheet.Cell(rowIndex, 8).Value = registration.HasCar ? "Да" : "Нет";
            sheet.Cell(rowIndex, 9).Value = FormatTelegram(telegram);
            sheet.Cell(rowIndex, 10).Value = registration.BirthDate == default ? string.Empty : registration.BirthDate.ToString("dd.MM.yyyy");
            sheet.Cell(rowIndex, 11).Value = registration.City;
            sheet.Cell(rowIndex, 12).Value = registration.ChurchName;
            sheet.Cell(rowIndex, 13).Value = registration.SelectedPriceOption?.Title ?? string.Empty;
            sheet.Cell(rowIndex, 14).Value = FormatAccommodation(registration.AccommodationPreference);
            sheet.Cell(rowIndex, 15).Value = BuildParticipantsList(registration);
            sheet.Cell(rowIndex, 16).Value = BuildMedicalNotes(registration);
            sheet.Cell(rowIndex, 17).Value = registration.Motivation ?? string.Empty;
            sheet.Cell(rowIndex, 18).Value = registration.CreatedAtUtc.ToString("dd.MM.yyyy HH:mm");
            sheet.Cell(rowIndex, 19).Value = registration.SubmittedAtUtc?.ToString("dd.MM.yyyy HH:mm") ?? string.Empty;
        }

        sheet.Columns().AdjustToContents(14, 40);
        sheet.Column(15).Width = 36;
        sheet.Column(16).Width = 42;
        sheet.Column(17).Width = 36;
        sheet.SheetView.FreezeRows(3);
    }

    private static void BuildParticipantsSheet(
        IXLWorksheet sheet,
        string eventTitle,
        IReadOnlyList<CampRegistration> registrations)
    {
        sheet.Cell(1, 1).Value = $"Состав групп: {eventTitle}";
        sheet.Range(1, 1, 1, 7).Merge().Style.Font.SetBold().Font.SetFontSize(14);

        var headers = new[]
        {
            "№ заявки",
            "Контактное лицо",
            "Участник",
            "Ребёнок",
            "Статус",
            "Телефон",
            "Email"
        };

        for (var index = 0; index < headers.Length; index++)
        {
            sheet.Cell(3, index + 1).Value = headers[index];
        }

        var headerRange = sheet.Range(3, 1, 3, headers.Length);
        headerRange.Style.Font.SetBold();
        headerRange.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#E8F1E6"));

        var rowIndex = 4;
        foreach (var registration in registrations)
        {
            var participants = registration.Participants.Count > 0
                ? registration.Participants.OrderBy(item => item.SortOrder).ToArray()
                : [new CampRegistrationParticipant
                    {
                        FullName = registration.FullName,
                        IsChild = registration.HasChildren,
                        SortOrder = 0
                    }];

            foreach (var participant in participants)
            {
                sheet.Cell(rowIndex, 1).Value = registration.Id.ToString();
                sheet.Cell(rowIndex, 2).Value = registration.FullName;
                sheet.Cell(rowIndex, 3).Value = participant.FullName;
                sheet.Cell(rowIndex, 4).Value = participant.IsChild ? "Да" : "Нет";
                sheet.Cell(rowIndex, 5).Value = FormatRegistrationStatus(registration.Status);
                sheet.Cell(rowIndex, 6).Value = registration.PhoneNumber;
                sheet.Cell(rowIndex, 7).Value = !string.IsNullOrWhiteSpace(registration.ContactEmail)
                    ? registration.ContactEmail
                    : TechnicalEmailHelper.ToVisibleEmail(registration.User.Email);
                rowIndex++;
            }
        }

        sheet.Columns().AdjustToContents(16, 40);
        sheet.SheetView.FreezeRows(3);
    }

    private static void BuildSummarySheet(
        IXLWorksheet sheet,
        string eventTitle,
        string eventSlug,
        IReadOnlyList<CampRegistration> registrations)
    {
        sheet.Cell(1, 1).Value = "Сводка по событию";
        sheet.Cell(2, 1).Value = "Событие";
        sheet.Cell(2, 2).Value = eventTitle;
        sheet.Cell(3, 1).Value = "Slug";
        sheet.Cell(3, 2).Value = eventSlug;
        sheet.Cell(5, 1).Value = "Всего заявок";
        sheet.Cell(5, 2).Value = registrations.Count;
        sheet.Cell(6, 1).Value = "Всего участников";
        sheet.Cell(6, 2).Value = registrations.Sum(EventRegistrationService.GetParticipantsCount);
        sheet.Cell(7, 1).Value = "Черновики";
        sheet.Cell(7, 2).Value = registrations.Count(item => item.Status == RegistrationStatus.Draft);
        sheet.Cell(8, 1).Value = "Отправлено";
        sheet.Cell(8, 2).Value = registrations.Count(item => item.Status == RegistrationStatus.Submitted);
        sheet.Cell(9, 1).Value = "Подтверждено";
        sheet.Cell(9, 2).Value = registrations.Count(item => item.Status == RegistrationStatus.Confirmed);
        sheet.Cell(10, 1).Value = "Отменено";
        sheet.Cell(10, 2).Value = registrations.Count(item => item.Status == RegistrationStatus.Cancelled);
        sheet.Cell(11, 1).Value = "Мест занято";
        sheet.Cell(11, 2).Value = registrations
            .Where(item => EventRegistrationService.CountsAgainstCapacity(item.Status))
            .Sum(EventRegistrationService.GetParticipantsCount);

        sheet.Range(1, 1, 1, 2).Style.Font.SetBold().Font.SetFontSize(14);
        sheet.Range(2, 1, 11, 2).Style.Border.SetOutsideBorder(XLBorderStyleValues.Thin);
        sheet.Columns().AdjustToContents();
    }

    private static string BuildMedicalNotes(CampRegistration registration)
    {
        var parts = new[]
        {
            string.IsNullOrWhiteSpace(registration.HealthNotes) ? null : $"Здоровье: {registration.HealthNotes}",
            string.IsNullOrWhiteSpace(registration.AllergyNotes) ? null : $"Аллергии: {registration.AllergyNotes}",
            string.IsNullOrWhiteSpace(registration.SpecialNeeds) ? null : $"Особые нужды: {registration.SpecialNeeds}"
        };

        return string.Join("\n", parts.Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static string BuildParticipantsList(CampRegistration registration)
    {
        var participants = registration.Participants.Count > 0
            ? registration.Participants.OrderBy(item => item.SortOrder).ToArray()
            : [new CampRegistrationParticipant
                {
                    FullName = registration.FullName,
                    IsChild = registration.HasChildren,
                    SortOrder = 0
                }];

        return string.Join(
            "\n",
            participants.Select((participant, index) =>
                $"{index + 1}. {participant.FullName}{(participant.IsChild ? " (ребёнок)" : string.Empty)}"));
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

    private static string FormatRegistrationStatus(RegistrationStatus status) => status switch
    {
        RegistrationStatus.Draft => "Черновик",
        RegistrationStatus.Submitted => "Отправлено",
        RegistrationStatus.Confirmed => "Подтверждено",
        RegistrationStatus.Cancelled => "Отменено",
        _ => status.ToString()
    };

    private static string FormatAccommodation(AccommodationPreference preference) => preference switch
    {
        AccommodationPreference.Tent => "Палатка",
        AccommodationPreference.Cabin => "Домик",
        AccommodationPreference.Either => "Без разницы",
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
