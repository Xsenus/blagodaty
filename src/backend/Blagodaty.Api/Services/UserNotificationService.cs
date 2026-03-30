using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Options;
using Blagodaty.Api.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Blagodaty.Api.Services;

public sealed class UserNotificationService
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    private readonly AppDbContext _dbContext;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly TimeProvider _timeProvider;
    private readonly FrontendOptions _frontendOptions;
    private readonly ILogger<UserNotificationService> _logger;

    public UserNotificationService(
        AppDbContext dbContext,
        ExternalAuthProviderService externalAuthProviderService,
        TimeProvider timeProvider,
        IOptions<FrontendOptions> frontendOptions,
        ILogger<UserNotificationService> logger)
    {
        _dbContext = dbContext;
        _externalAuthProviderService = externalAuthProviderService;
        _timeProvider = timeProvider;
        _frontendOptions = frontendOptions.Value;
        _logger = logger;
    }

    public Task<int> GetUnreadCountAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        return _dbContext.UserNotifications
            .AsNoTracking()
            .CountAsync(item => item.UserId == userId && !item.IsRead, cancellationToken);
    }

    public async Task<AccountNotificationsResponse> GetNotificationsAsync(
        Guid userId,
        int page,
        int pageSize,
        bool unreadOnly,
        CancellationToken cancellationToken = default)
    {
        page = NormalizePage(page);
        pageSize = NormalizePageSize(pageSize);

        var query = _dbContext.UserNotifications
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .Where(item => item.UserId == userId);

        if (unreadOnly)
        {
            query = query.Where(item => !item.IsRead);
        }

        var unreadCountTask = GetUnreadCountAsync(userId, cancellationToken);
        var totalItems = await query.CountAsync(cancellationToken);
        var totalPages = CalculateTotalPages(totalItems, pageSize);
        page = Math.Min(page, totalPages);

        var items = await query
            .OrderByDescending(item => item.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(item => new AccountNotificationDto
            {
                Id = item.Id,
                Type = item.Type,
                Severity = item.Severity,
                Title = item.Title,
                Message = item.Message,
                LinkUrl = item.LinkUrl,
                EventEditionId = item.EventEditionId,
                RegistrationId = item.RegistrationId,
                EventSlug = item.EventEdition != null ? item.EventEdition.Slug : null,
                EventTitle = item.EventEdition != null ? item.EventEdition.Title : null,
                IsRead = item.IsRead,
                CreatedAtUtc = item.CreatedAtUtc,
                ReadAtUtc = item.ReadAtUtc
            })
            .ToArrayAsync(cancellationToken);

        return new AccountNotificationsResponse
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalItems = totalItems,
            TotalPages = totalPages,
            UnreadCount = await unreadCountTask
        };
    }

    public async Task<bool> MarkAsReadAsync(Guid userId, Guid notificationId, CancellationToken cancellationToken = default)
    {
        var notification = await _dbContext.UserNotifications
            .FirstOrDefaultAsync(item => item.Id == notificationId && item.UserId == userId, cancellationToken);

        if (notification is null)
        {
            return false;
        }

        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return true;
    }

    public async Task<int> MarkAllAsReadAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var notifications = await _dbContext.UserNotifications
            .Where(item => item.UserId == userId && !item.IsRead)
            .ToListAsync(cancellationToken);

        if (notifications.Count == 0)
        {
            return 0;
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        foreach (var notification in notifications)
        {
            notification.IsRead = true;
            notification.ReadAtUtc = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return notifications.Count;
    }

    public async Task NotifyRegistrationSubmittedAsync(CampRegistration registration, CancellationToken cancellationToken = default)
    {
        if (registration.EventEditionId is null || registration.EventEdition is null)
        {
            return;
        }

        var eventTitle = registration.EventEdition.Title;
        var eventLink = BuildCabinetLink($"/camp-registration?event={registration.EventEdition.Slug}");

        await CreateNotificationAsync(
            registration.UserId,
            UserNotificationType.RegistrationSubmitted,
            NotificationSeverity.Success,
            "Анкета отправлена",
            $"Заявка на «{eventTitle}» уже передана команде. Мы увидим её и свяжемся с вами по следующим шагам.",
            eventLink,
            registration.EventEditionId,
            registration.Id,
            $"registration:{registration.Id}:submitted:user",
            sendTelegram: true,
            cancellationToken);

        var teamRecipientIds = await GetTeamRecipientIdsAsync(cancellationToken);
        foreach (var recipientId in teamRecipientIds)
        {
            await CreateNotificationAsync(
                recipientId,
                UserNotificationType.RegistrationSubmitted,
                NotificationSeverity.Info,
                "Новая анкета по мероприятию",
                $"Участник {registration.FullName} отправил заявку на «{eventTitle}».",
                BuildCabinetLink("/admin/registrations"),
                registration.EventEditionId,
                registration.Id,
                $"registration:{registration.Id}:submitted:team",
                sendTelegram: true,
                cancellationToken);
        }
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

        var (title, message, severity) = registration.Status switch
        {
            RegistrationStatus.Confirmed => (
                "Заявка подтверждена",
                $"Команда подтвердила ваше участие в «{registration.EventEdition.Title}». Все актуальные детали доступны в личном кабинете.",
                NotificationSeverity.Success),
            RegistrationStatus.Cancelled => (
                "Статус заявки обновлён",
                $"Заявка на «{registration.EventEdition.Title}» переведена в состояние «Отменено». Если это неожиданно, пожалуйста, свяжитесь с командой.",
                NotificationSeverity.Warning),
            RegistrationStatus.Submitted => (
                "Заявка возвращена в обработку",
                $"Заявка на «{registration.EventEdition.Title}» снова находится в статусе «Отправлено».",
                NotificationSeverity.Info),
            _ => (
                "Заявка переведена в черновик",
                $"Заявка на «{registration.EventEdition.Title}» снова открыта как черновик и доступна для редактирования.",
                NotificationSeverity.Info)
        };

        await CreateNotificationAsync(
            registration.UserId,
            UserNotificationType.RegistrationStatusChanged,
            severity,
            title,
            message,
            BuildCabinetLink($"/camp-registration?event={registration.EventEdition.Slug}"),
            registration.EventEditionId,
            registration.Id,
            $"registration:{registration.Id}:status:{registration.Status}",
            sendTelegram: true,
            cancellationToken);
    }

    public async Task DispatchClosingSoonNotificationsAsync(CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var horizon = now.AddDays(3);

        var closingEvents = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .Where(item =>
                item.EventSeries.IsActive &&
                item.Status == EventEditionStatus.RegistrationOpen &&
                item.RegistrationClosesAtUtc.HasValue &&
                item.RegistrationClosesAtUtc.Value > now &&
                item.RegistrationClosesAtUtc.Value <= horizon)
            .Select(item => new ClosingEventProjection
            {
                Id = item.Id,
                Slug = item.Slug,
                Title = item.Title,
                RegistrationClosesAtUtc = item.RegistrationClosesAtUtc!.Value
            })
            .ToListAsync(cancellationToken);

        if (closingEvents.Count == 0)
        {
            return;
        }

        var closingEventIds = closingEvents.Select(item => item.Id).ToArray();
        var drafts = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item =>
                item.EventEditionId != null &&
                closingEventIds.Contains(item.EventEditionId.Value) &&
                item.Status == RegistrationStatus.Draft)
            .Select(item => new DraftRegistrationProjection
            {
                RegistrationId = item.Id,
                UserId = item.UserId,
                EventEditionId = item.EventEditionId!.Value
            })
            .ToListAsync(cancellationToken);

        var eventsById = closingEvents.ToDictionary(item => item.Id);
        foreach (var draft in drafts)
        {
            var eventItem = eventsById[draft.EventEditionId];
            await CreateNotificationAsync(
                draft.UserId,
                UserNotificationType.RegistrationClosingSoon,
                NotificationSeverity.Warning,
                "Регистрация скоро закроется",
                $"У вас есть черновик заявки на «{eventItem.Title}». Регистрация закроется {FormatDateTime(eventItem.RegistrationClosesAtUtc)}.",
                BuildCabinetLink($"/camp-registration?event={eventItem.Slug}"),
                eventItem.Id,
                draft.RegistrationId,
                $"event:{eventItem.Id}:closing-soon:draft",
                sendTelegram: true,
                cancellationToken);
        }

        var teamRecipientIds = await GetTeamRecipientIdsAsync(cancellationToken);
        foreach (var eventItem in closingEvents)
        {
            foreach (var recipientId in teamRecipientIds)
            {
                await CreateNotificationAsync(
                    recipientId,
                    UserNotificationType.RegistrationClosingSoon,
                    NotificationSeverity.Warning,
                    "Скоро закроется регистрация",
                    $"У события «{eventItem.Title}» регистрация закрывается {FormatDateTime(eventItem.RegistrationClosesAtUtc)}.",
                    BuildCabinetLink("/admin/events"),
                    eventItem.Id,
                    null,
                    $"event:{eventItem.Id}:closing-soon:team",
                    sendTelegram: true,
                    cancellationToken);
            }
        }
    }

    private async Task<bool> CreateNotificationAsync(
        Guid userId,
        UserNotificationType type,
        NotificationSeverity severity,
        string title,
        string message,
        string? linkUrl,
        Guid? eventEditionId,
        Guid? registrationId,
        string? deduplicationKey,
        bool sendTelegram,
        CancellationToken cancellationToken)
    {
        var normalizedLink = NormalizeValue(linkUrl);
        var normalizedDedupeKey = NormalizeValue(deduplicationKey);
        var notification = new UserNotification
        {
            UserId = userId,
            Type = type,
            Severity = severity,
            Title = title.Trim(),
            Message = message.Trim(),
            LinkUrl = normalizedLink,
            EventEditionId = eventEditionId,
            RegistrationId = registrationId,
            DeduplicationKey = normalizedDedupeKey,
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
        };

        _dbContext.UserNotifications.Add(notification);

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (normalizedDedupeKey is not null)
        {
            _logger.LogDebug(exception, "Notification with dedupe key {DedupeKey} already exists for user {UserId}.", normalizedDedupeKey, userId);
            _dbContext.Entry(notification).State = EntityState.Detached;
            return false;
        }

        if (sendTelegram)
        {
            await SendTelegramNotificationAsync(userId, notification.Title, notification.Message, normalizedLink, cancellationToken);
        }

        return true;
    }

    private async Task SendTelegramNotificationAsync(
        Guid userId,
        string title,
        string message,
        string? linkUrl,
        CancellationToken cancellationToken)
    {
        var chatIds = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(item => item.UserId == userId && item.Provider == "telegram" && item.TelegramChatId != null)
            .Select(item => item.TelegramChatId!.Value)
            .Distinct()
            .ToArrayAsync(cancellationToken);

        if (chatIds.Length == 0)
        {
            return;
        }

        var text = string.IsNullOrWhiteSpace(linkUrl)
            ? $"{title}\n\n{message}"
            : $"{title}\n\n{message}\n\n{linkUrl}";

        foreach (var chatId in chatIds)
        {
            await _externalAuthProviderService.SendTelegramMessageAsync(chatId, text, cancellationToken);
        }
    }

    private async Task<IReadOnlyCollection<Guid>> GetTeamRecipientIdsAsync(CancellationToken cancellationToken)
    {
        var roleNames = new[] { AppRoles.Admin, AppRoles.CampManager };
        var recipientIds = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where role.Name != null && roleNames.Contains(role.Name)
            select userRole.UserId
        )
            .Distinct()
            .ToArrayAsync(cancellationToken);

        return recipientIds;
    }

    private string BuildCabinetLink(string relativePath)
    {
        var baseUrl = NormalizeValue(_frontendOptions.CabinetUrl);
        if (baseUrl is null)
        {
            return relativePath;
        }

        var path = relativePath.StartsWith("/", StringComparison.Ordinal) ? relativePath : "/" + relativePath;
        return $"{baseUrl.TrimEnd('/')}{path}";
    }

    private static string FormatDateTime(DateTime value)
    {
        return value.ToString("dd.MM.yyyy HH:mm 'UTC'");
    }

    private static string? NormalizeValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static int NormalizePage(int page)
    {
        return page < 1 ? 1 : page;
    }

    private static int NormalizePageSize(int pageSize)
    {
        if (pageSize <= 0)
        {
            return DefaultPageSize;
        }

        return Math.Clamp(pageSize, 1, MaxPageSize);
    }

    private static int CalculateTotalPages(int totalItems, int pageSize)
    {
        return Math.Max(1, (int)Math.Ceiling(totalItems / (double)pageSize));
    }

    private sealed class ClosingEventProjection
    {
        public required Guid Id { get; init; }
        public required string Slug { get; init; }
        public required string Title { get; init; }
        public required DateTime RegistrationClosesAtUtc { get; init; }
    }

    private sealed class DraftRegistrationProjection
    {
        public required Guid RegistrationId { get; init; }
        public required Guid UserId { get; init; }
        public required Guid EventEditionId { get; init; }
    }
}
