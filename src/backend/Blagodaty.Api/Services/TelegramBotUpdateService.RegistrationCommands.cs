using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed partial class TelegramBotUpdateService
{
    private async Task<CommandResult> HandleEventStatsDetailedAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        string? arguments,
        TelegramOperator? operatorUser,
        CancellationToken cancellationToken)
    {
        var accessError = await EnsureManagementAccessAsync(chat, message, operatorUser, cancellationToken);
        if (accessError is not null)
        {
            return accessError.Value;
        }

        var slug = NormalizeValue(arguments);
        if (slug is null)
        {
            return CommandResult.Handled("Укажите slug события: /event_stats <slug>.");
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .FirstOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (eventItem is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item => item.EventEditionId == eventItem.Id)
            .GroupBy(item => item.Status)
            .Select(group => new RegistrationStatusSummary(
                group.Key,
                group.Count(),
                group.Sum(item => item.ParticipantsCount)))
            .ToListAsync(cancellationToken);

        var totalApplications = registrations.Sum(item => item.Applications);
        var totalParticipants = registrations.Sum(item => item.Participants);
        var draftApplications = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Draft)?.Applications ?? 0;
        var submittedApplications = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Submitted)?.Applications ?? 0;
        var confirmedApplications = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Confirmed)?.Applications ?? 0;
        var cancelledApplications = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Cancelled)?.Applications ?? 0;
        var draftParticipants = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Draft)?.Participants ?? 0;
        var submittedParticipants = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Submitted)?.Participants ?? 0;
        var confirmedParticipants = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Confirmed)?.Participants ?? 0;
        var cancelledParticipants = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Cancelled)?.Participants ?? 0;
        var occupied = submittedParticipants + confirmedParticipants;
        var capacityText = eventItem.Capacity.HasValue
            ? $"{occupied} из {eventItem.Capacity.Value}"
            : $"{occupied} без лимита";
        var leftText = eventItem.Capacity.HasValue
            ? Math.Max(0, eventItem.Capacity.Value - occupied).ToString()
            : "не ограничено";

        return CommandResult.Handled(string.Join("\n", new[]
        {
            $"Статистика по «{eventItem.Title}»",
            $"Slug: {eventItem.Slug}",
            $"Статус события: {FormatEventStatus(eventItem.Status)}",
            $"Всего заявок: {totalApplications}",
            $"Всего участников: {totalParticipants}",
            $"Черновики: {draftApplications} заяв. / {draftParticipants} чел.",
            $"Отправлено: {submittedApplications} заяв. / {submittedParticipants} чел.",
            $"Подтверждено: {confirmedApplications} заяв. / {confirmedParticipants} чел.",
            $"Отменено: {cancelledApplications} заяв. / {cancelledParticipants} чел.",
            $"Занято мест: {capacityText}",
            $"Осталось мест: {leftText}"
        }));
    }

    private async Task<CommandResult> HandleEventParticipantsDetailedAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        string? arguments,
        TelegramOperator? operatorUser,
        CancellationToken cancellationToken)
    {
        var accessError = await EnsureManagementAccessAsync(chat, message, operatorUser, cancellationToken);
        if (accessError is not null)
        {
            return accessError.Value;
        }

        var slug = NormalizeValue(arguments);
        if (slug is null)
        {
            return CommandResult.Handled("Укажите slug события: /event_participants <slug>.");
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (eventItem is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.Participants)
            .Where(item => item.EventEditionId == eventItem.Id && item.Status == RegistrationStatus.Confirmed)
            .OrderBy(item => item.FullName)
            .ToListAsync(cancellationToken);

        if (registrations.Count == 0)
        {
            return CommandResult.Handled($"По «{eventItem.Title}» пока нет подтверждённых участников.");
        }

        var participants = registrations
            .SelectMany(registration =>
            {
                if (registration.Participants.Count > 0)
                {
                    return registration.Participants
                        .OrderBy(item => item.SortOrder)
                        .Select(item => new ParticipantListRow(
                            item.FullName,
                            item.IsChild,
                            registration.City,
                            registration.ChurchName));
                }

                return new[]
                {
                    new ParticipantListRow(
                        registration.FullName,
                        registration.HasChildren,
                        registration.City,
                        registration.ChurchName)
                };
            })
            .OrderBy(item => item.FullName)
            .Take(20)
            .ToList();

        var lines = new List<string>
        {
            $"Подтверждённые участники «{eventItem.Title}»",
            $"Показаны первые {participants.Count} строк"
        };

        foreach (var participant in participants)
        {
            var details = new[] { NormalizeValue(participant.City), NormalizeValue(participant.ChurchName) }
                .Where(item => !string.IsNullOrWhiteSpace(item));
            var suffix = details.Any() ? $" ({string.Join(", ", details)})" : string.Empty;
            var childSuffix = participant.IsChild ? " [ребёнок]" : string.Empty;
            lines.Add($"• {participant.FullName}{childSuffix}{suffix}");
        }

        return CommandResult.Handled(string.Join("\n", lines));
    }

    private async Task<CommandResult> HandleEventRegistrationsDetailedAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        string? arguments,
        TelegramOperator? operatorUser,
        CancellationToken cancellationToken)
    {
        var accessError = await EnsureManagementAccessAsync(chat, message, operatorUser, cancellationToken);
        if (accessError is not null)
        {
            return accessError.Value;
        }

        var slug = NormalizeValue(arguments);
        if (slug is null)
        {
            return CommandResult.Handled("Укажите slug события: /event_registrations <slug>.");
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (eventItem is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item => item.EventEditionId == eventItem.Id)
            .OrderByDescending(item => item.SubmittedAtUtc ?? item.UpdatedAtUtc)
            .ThenBy(item => item.FullName)
            .Take(15)
            .Select(item => new RegistrationListRow(
                item.FullName,
                item.ParticipantsCount,
                item.Status,
                item.City,
                item.UpdatedAtUtc))
            .ToListAsync(cancellationToken);

        if (registrations.Count == 0)
        {
            return CommandResult.Handled($"По «{eventItem.Title}» пока нет заявок.");
        }

        var lines = new List<string>
        {
            $"Последние заявки по «{eventItem.Title}»"
        };

        foreach (var registration in registrations)
        {
            var citySuffix = string.IsNullOrWhiteSpace(registration.City) ? string.Empty : $" • {registration.City}";
            var participantsSuffix = registration.ParticipantsCount > 1 ? $" • {registration.ParticipantsCount} чел." : string.Empty;
            lines.Add($"• {registration.FullName} — {FormatRegistrationStatus(registration.Status)}{participantsSuffix}{citySuffix} • {registration.UpdatedAtUtc:dd.MM HH:mm}");
        }

        return CommandResult.Handled(string.Join("\n", lines));
    }

    private sealed record RegistrationStatusSummary(
        RegistrationStatus Status,
        int Applications,
        int Participants);

    private sealed record ParticipantListRow(
        string FullName,
        bool IsChild,
        string City,
        string ChurchName);

    private sealed record RegistrationListRow(
        string FullName,
        int ParticipantsCount,
        RegistrationStatus Status,
        string City,
        DateTime UpdatedAtUtc);
}
