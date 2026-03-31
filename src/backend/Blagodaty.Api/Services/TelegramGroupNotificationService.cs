using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Services;

public sealed class TelegramGroupNotificationService
{
    private readonly AppDbContext _dbContext;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly FrontendOptions _frontendOptions;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<TelegramGroupNotificationService> _logger;

    public TelegramGroupNotificationService(
        AppDbContext dbContext,
        ExternalAuthProviderService externalAuthProviderService,
        IOptions<FrontendOptions> frontendOptions,
        TimeProvider timeProvider,
        ILogger<TelegramGroupNotificationService> logger)
    {
        _dbContext = dbContext;
        _externalAuthProviderService = externalAuthProviderService;
        _frontendOptions = frontendOptions.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task NotifyRegistrationSubmittedAsync(CampRegistration registration, CancellationToken cancellationToken = default)
    {
        if (registration.EventEditionId is null || registration.EventEdition is null)
        {
            return;
        }

        var text = string.Join("\n", new[]
        {
            $"Новая заявка на «{registration.EventEdition.Title}»",
            $"Контакт: {registration.FullName}",
            string.IsNullOrWhiteSpace(registration.ContactEmail) ? null : $"Email: {registration.ContactEmail}",
            string.IsNullOrWhiteSpace(registration.PhoneNumber) ? null : $"Телефон: {registration.PhoneNumber}",
            $"Участников: {EventRegistrationService.GetParticipantsCount(registration)}",
            registration.HasChildren ? "Есть дети: да" : null,
            registration.HasCar ? "Автомобиль: да" : null,
            string.IsNullOrWhiteSpace(registration.City) ? null : $"Город: {registration.City}",
            string.IsNullOrWhiteSpace(registration.ChurchName) ? null : $"Церковь: {registration.ChurchName}",
            $"Размещение: {FormatAccommodation(registration.AccommodationPreference)}",
            $"Статус: {FormatRegistrationStatus(registration.Status)}",
            BuildCabinetLink("/admin/registrations")
        }.Where(item => !string.IsNullOrWhiteSpace(item)));

        await NotifyAsync(
            registration.EventEditionId.Value,
            TelegramChatSubscriptionType.RegistrationSubmitted,
            text,
            $"registration:{registration.Id}:submitted",
            cancellationToken);
    }

    public async Task NotifyRegistrationStatusChangedAsync(
        CampRegistration registration,
        RegistrationStatus previousStatus,
        CancellationToken cancellationToken = default)
    {
        if (registration.EventEditionId is null || registration.EventEdition is null || previousStatus == registration.Status)
        {
            return;
        }

        var text = string.Join("\n", new[]
        {
            $"Изменён статус заявки на «{registration.EventEdition.Title}»",
            $"Контакт: {registration.FullName}",
            $"Участников: {EventRegistrationService.GetParticipantsCount(registration)}",
            $"Было: {FormatRegistrationStatus(previousStatus)}",
            $"Стало: {FormatRegistrationStatus(registration.Status)}",
            BuildCabinetLink("/admin/registrations")
        }.Where(item => !string.IsNullOrWhiteSpace(item)));

        await NotifyAsync(
            registration.EventEditionId.Value,
            TelegramChatSubscriptionType.RegistrationStatusChanged,
            text,
            $"registration:{registration.Id}:status:{registration.Status}",
            cancellationToken);
    }

    public async Task NotifyRegistrationClosingSoonAsync(
        Guid eventEditionId,
        string eventTitle,
        DateTime registrationClosesAtUtc,
        CancellationToken cancellationToken = default)
    {
        var text = string.Join("\n", new[]
        {
            $"Регистрация на «{eventTitle}» скоро закроется",
            $"Дедлайн: {registrationClosesAtUtc:dd.MM.yyyy HH:mm} UTC",
            BuildCabinetLink("/admin/events")
        });

        await NotifyAsync(
            eventEditionId,
            TelegramChatSubscriptionType.RegistrationClosingSoon,
            text,
            $"event:{eventEditionId}:closing-soon",
            cancellationToken);
    }

    private async Task NotifyAsync(
        Guid eventEditionId,
        TelegramChatSubscriptionType subscriptionType,
        string text,
        string? notificationKey,
        CancellationToken cancellationToken)
    {
        var targets = await _dbContext.TelegramChatSubscriptions
            .AsNoTracking()
            .Include(item => item.Chat)
            .Where(item =>
                item.EventEditionId == eventEditionId &&
                item.SubscriptionType == subscriptionType &&
                item.IsEnabled &&
                item.Chat.IsActive)
            .Select(item => new
            {
                item.Id,
                item.Chat.ChatId,
                item.MessageThreadId
            })
            .ToListAsync(cancellationToken);

        foreach (var target in targets)
        {
            if (!string.IsNullOrWhiteSpace(notificationKey))
            {
                var alreadySent = await _dbContext.TelegramSubscriptionDeliveryLogs
                    .AsNoTracking()
                    .AnyAsync(
                        item => item.TelegramChatSubscriptionId == target.Id && item.NotificationKey == notificationKey,
                        cancellationToken);
                if (alreadySent)
                {
                    continue;
                }
            }

            var sent = await _externalAuthProviderService.TrySendTelegramMessageAsync(
                target.ChatId,
                text,
                target.MessageThreadId,
                cancellationToken);

            if (!sent || string.IsNullOrWhiteSpace(notificationKey))
            {
                continue;
            }

            _dbContext.TelegramSubscriptionDeliveryLogs.Add(new TelegramSubscriptionDeliveryLog
            {
                Id = Guid.NewGuid(),
                TelegramChatSubscriptionId = target.Id,
                NotificationKey = notificationKey,
                SentAtUtc = _timeProvider.GetUtcNow().UtcDateTime
            });

            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception)
            {
                _logger.LogDebug(
                    exception,
                    "Telegram delivery log for subscription {SubscriptionId} and key {NotificationKey} already exists.",
                    target.Id,
                    notificationKey);
            }
        }
    }

    private string BuildCabinetLink(string relativePath)
    {
        var baseUrl = string.IsNullOrWhiteSpace(_frontendOptions.CabinetUrl) ? null : _frontendOptions.CabinetUrl.Trim();
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            return relativePath;
        }

        var path = relativePath.StartsWith("/", StringComparison.Ordinal) ? relativePath : "/" + relativePath;
        return $"{baseUrl.TrimEnd('/')}{path}";
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
        AccommodationPreference.Tent => "палатка",
        AccommodationPreference.Cabin => "домик",
        AccommodationPreference.Either => "без разницы",
        _ => preference.ToString()
    };
}
