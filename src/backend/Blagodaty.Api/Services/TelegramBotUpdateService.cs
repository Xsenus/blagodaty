using System.Text.Json;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Services;

public sealed partial class TelegramBotUpdateService
{
    private readonly AppDbContext _dbContext;
    private readonly ExternalIdentityService _externalIdentityService;
    private readonly ExternalAuthProviderService _externalAuthProviderService;
    private readonly EventRegistrationExportService _eventRegistrationExportService;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<TelegramBotUpdateService> _logger;

    public TelegramBotUpdateService(
        AppDbContext dbContext,
        ExternalIdentityService externalIdentityService,
        ExternalAuthProviderService externalAuthProviderService,
        EventRegistrationExportService eventRegistrationExportService,
        TimeProvider timeProvider,
        ILogger<TelegramBotUpdateService> logger)
    {
        _dbContext = dbContext;
        _externalIdentityService = externalIdentityService;
        _externalAuthProviderService = externalAuthProviderService;
        _eventRegistrationExportService = eventRegistrationExportService;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task HandleUpdateAsync(JsonDocument update, CancellationToken cancellationToken = default)
    {
        var message = TryReadIncomingMessage(update.RootElement);
        if (message is null)
        {
            return;
        }

        TelegramChat? chat = null;
        if (message.ChatId != 0)
        {
            chat = await UpsertChatAsync(message, cancellationToken);
        }

        if (string.IsNullOrWhiteSpace(message.Text))
        {
            return;
        }

        var authState = ExtractTelegramState(message.Text);
        if (!string.IsNullOrWhiteSpace(authState))
        {
            await HandleTelegramAuthUpdateAsync(message, authState, cancellationToken);
            return;
        }

        var command = await ParseCommandAsync(message.Text, cancellationToken);
        if (command is null)
        {
            return;
        }

        await HandleCommandAsync(chat, message, command.Value, cancellationToken);
    }

    private async Task HandleTelegramAuthUpdateAsync(
        TelegramIncomingMessage message,
        string state,
        CancellationToken cancellationToken)
    {
        var request = await _dbContext.TelegramAuthRequests
            .FirstOrDefaultAsync(item => item.State == state, cancellationToken);
        if (request is null)
        {
            return;
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        if (request.ExpiresAtUtc <= now)
        {
            request.Status = ExternalAuthRequestStatus.Expired;
            request.ErrorMessage = "Telegram auth session expired.";
            await _dbContext.SaveChangesAsync(cancellationToken);
            return;
        }

        if (string.IsNullOrWhiteSpace(message.FromUserId))
        {
            return;
        }

        var profile = new ExternalIdentityProfile(
            Provider: "telegram",
            ProviderUserId: message.FromUserId,
            Email: null,
            EmailVerified: false,
            Username: message.FromUsername,
            DisplayName: message.FromDisplayName,
            AvatarUrl: null,
            TelegramChatId: message.ChatId);

        if (request.Intent == ExternalAuthIntent.Link)
        {
            if (request.UserId is null)
            {
                request.Status = ExternalAuthRequestStatus.Failed;
                request.ErrorMessage = "Target user for Telegram linking was not found.";
            }
            else
            {
                await _externalIdentityService.AttachExternalIdentityAsync(request.UserId.Value, profile, cancellationToken);
                request.Status = ExternalAuthRequestStatus.Completed;
                request.CompletedAtUtc = now;
                request.TelegramUserId = message.FromUserId;
                request.TelegramUsername = message.FromUsername;
                request.TelegramDisplayName = message.FromDisplayName;
                request.TelegramChatId = message.ChatId;
                await LogAuthEventAsync(request.UserId, "telegram", "link", "Telegram bot");
            }
        }
        else if (request.Intent == ExternalAuthIntent.Test)
        {
            request.Status = ExternalAuthRequestStatus.Completed;
            request.CompletedAtUtc = now;
            request.TelegramUserId = message.FromUserId;
            request.TelegramUsername = message.FromUsername;
            request.TelegramDisplayName = message.FromDisplayName;
            request.TelegramChatId = message.ChatId;
            request.ErrorMessage = BuildTelegramTestSuccessMessage(message.FromUsername, message.FromUserId);
            await LogAuthEventAsync(null, "telegram", "test", request.ErrorMessage);
        }
        else
        {
            var user = await _externalIdentityService.ResolveOrCreateExternalUserAsync(profile, cancellationToken);
            request.UserId = user.Id;
            request.Status = ExternalAuthRequestStatus.Completed;
            request.CompletedAtUtc = now;
            request.TelegramUserId = message.FromUserId;
            request.TelegramUsername = message.FromUsername;
            request.TelegramDisplayName = message.FromDisplayName;
            request.TelegramChatId = message.ChatId;
            await LogAuthEventAsync(user.Id, "telegram", "login", "Telegram bot");
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        await _externalAuthProviderService.SendTelegramMessageAsync(
            message.ChatId,
            request.Status == ExternalAuthRequestStatus.Completed
                ? "Вход подтвержден. Возвращайтесь на сайт."
                : "Не удалось завершить вход. Вернитесь на сайт и попробуйте снова.",
            cancellationToken);
    }

    private async Task HandleCommandAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        TelegramParsedCommand command,
        CancellationToken cancellationToken)
    {
        var operatorUser = await ResolveOperatorAsync(message.FromUserId, cancellationToken);

        try
        {
            var result = command.Name switch
            {
                "start" => CommandResult.Handled(BuildHelpText()),
                "help" => CommandResult.Handled(BuildHelpText()),
                "events" => CommandResult.Handled(await BuildEventsTextAsync(cancellationToken)),
                "event_stats" => await HandleEventStatsAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "event_participants" => await HandleEventParticipantsAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "event_registrations" => await HandleEventRegistrationsAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "event_export" => await HandleEventExportAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "bind_event" => await HandleBindEventAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "unbind_event" => await HandleUnbindEventAsync(chat, message, command.Arguments, operatorUser, cancellationToken),
                "subscriptions" => await HandleSubscriptionsAsync(chat, message, operatorUser, cancellationToken),
                "chat_id" => CommandResult.Handled(BuildChatInfoText(chat, message)),
                _ => CommandResult.Ignored("Неизвестная команда. Используйте /help.")
            };

            if (!string.IsNullOrWhiteSpace(result.Message))
            {
                await _externalAuthProviderService.SendTelegramMessageAsync(
                    message.ChatId,
                    result.Message!,
                    message.MessageThreadId,
                    cancellationToken);
            }

            await LogCommandAsync(chat, message, command, operatorUser?.UserId, result.Status, result.Message, cancellationToken);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to handle Telegram command {Command} for chat {ChatId}.", command.Name, message.ChatId);
            const string errorMessage = "Не удалось выполнить команду. Попробуйте ещё раз чуть позже.";
            await _externalAuthProviderService.SendTelegramMessageAsync(
                message.ChatId,
                errorMessage,
                message.MessageThreadId,
                cancellationToken);
            await LogCommandAsync(chat, message, command, operatorUser?.UserId, TelegramCommandLogStatus.Failed, errorMessage, cancellationToken);
        }
    }
}

public sealed partial class TelegramBotUpdateService
{
    private static TelegramIncomingMessage? TryReadIncomingMessage(JsonElement root)
    {
        if (!TryGetObject(root, "message", out var message) &&
            !TryGetObject(root, "edited_message", out message))
        {
            return null;
        }

        if (!TryGetObject(message, "chat", out var chat))
        {
            return null;
        }

        TryGetObject(message, "from", out var from);

        return new TelegramIncomingMessage(
            ChatId: ReadTelegramLong(chat, "id") ?? 0,
            ChatKind: ParseChatKind(ReadTelegramString(chat, "type")),
            ChatTitle: ReadTelegramString(chat, "title"),
            ChatUsername: ReadTelegramString(chat, "username"),
            IsForum: ReadTelegramBool(chat, "is_forum") ?? false,
            MessageThreadId: ReadTelegramLong(message, "message_thread_id"),
            Text: ReadTelegramString(message, "text"),
            FromUserId: ReadTelegramString(from, "id"),
            FromUsername: ReadTelegramString(from, "username"),
            FromDisplayName: BuildDisplayName(
                ReadTelegramString(from, "first_name"),
                ReadTelegramString(from, "last_name")));
    }

    private static bool TryGetObject(JsonElement root, string propertyName, out JsonElement value)
    {
        if (root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty(propertyName, out value) &&
            value.ValueKind == JsonValueKind.Object)
        {
            return true;
        }

        value = default;
        return false;
    }

    private static string BuildHelpText()
    {
        return string.Join("\n", new[]
        {
            "Blagodaty bot: доступные команды",
            "/events - список актуальных событий",
            "/event_stats <slug> - статистика по событию",
            "/event_participants <slug> - участники события",
            "/event_registrations <slug> - последние заявки и статусы",
            "/event_export <slug> - Excel со списком заявок",
            "/bind_event <slug> - привязать текущий чат к событию",
            "/unbind_event <slug> - отключить привязку события для чата",
            "/subscriptions - показать активные подписки этого чата",
            "/chat_id - показать идентификатор текущего чата"
        });
    }

    private static string BuildChatInfoText(TelegramChat? chat, TelegramIncomingMessage message)
    {
        var lines = new List<string>
        {
            $"Chat ID: {message.ChatId}",
            $"Тип: {FormatChatKind(chat?.Kind ?? message.ChatKind)}"
        };

        if (message.MessageThreadId.HasValue)
        {
            lines.Add($"Thread ID: {message.MessageThreadId.Value}");
        }

        if (!string.IsNullOrWhiteSpace(chat?.Title))
        {
            lines.Add($"Название: {chat.Title}");
        }

        return string.Join("\n", lines);
    }

    private static bool CanManageEvents(TelegramOperator? operatorUser)
    {
        return operatorUser is not null &&
               operatorUser.Roles.Any(role =>
                   string.Equals(role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(role, AppRoles.CampManager, StringComparison.OrdinalIgnoreCase));
    }

    private async Task<CommandResult?> EnsureManagementAccessAsync(
        TelegramChat? chat,
        TelegramIncomingMessage? message,
        TelegramOperator? operatorUser,
        CancellationToken cancellationToken)
    {
        if (!CanManageEvents(operatorUser))
        {
            return CommandResult.Forbidden("Команда доступна только администраторам и координаторам с привязанным Telegram-аккаунтом.");
        }

        if (chat is null || chat.Kind == TelegramChatKind.Private)
        {
            return null;
        }

        if (chat.Kind != TelegramChatKind.Group && chat.Kind != TelegramChatKind.Supergroup)
        {
            return CommandResult.Forbidden("Команда поддерживается только в личных чатах, группах и супергруппах.");
        }

        if (message is null || !long.TryParse(message.FromUserId, out var telegramUserId))
        {
            return CommandResult.Forbidden("Не удалось определить пользователя Telegram для проверки прав в группе.");
        }

        var isGroupAdmin = await _externalAuthProviderService.IsTelegramChatAdminAsync(chat.ChatId, telegramUserId, cancellationToken);
        return isGroupAdmin
            ? null
            : CommandResult.Forbidden("В групповом чате команду может запускать только администратор этой группы.");
    }

    private static string? ExtractTelegramState(string? text)
    {
        var normalized = text?.Trim();
        const string prefix = "/start login_";
        if (string.IsNullOrWhiteSpace(normalized) || !normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return normalized[prefix.Length..].Trim();
    }

    private static string? ReadTelegramString(JsonElement root, string propertyName)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.String => NormalizeValue(value.GetString()),
            JsonValueKind.Number => value.GetInt64().ToString(),
            _ => null
        };
    }

    private static long? ReadTelegramLong(JsonElement root, string propertyName)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Number => value.GetInt64(),
            JsonValueKind.String when long.TryParse(value.GetString(), out var parsed) => parsed,
            _ => null
        };
    }

    private static bool? ReadTelegramBool(JsonElement root, string propertyName)
    {
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => null
        };
    }

    private static TelegramChatKind ParseChatKind(string? value)
    {
        return NormalizeValue(value)?.ToLowerInvariant() switch
        {
            "private" => TelegramChatKind.Private,
            "group" => TelegramChatKind.Group,
            "supergroup" => TelegramChatKind.Supergroup,
            "channel" => TelegramChatKind.Channel,
            _ => TelegramChatKind.Unknown
        };
    }

    private static string FormatChatKind(TelegramChatKind kind) => kind switch
    {
        TelegramChatKind.Private => "Личный чат",
        TelegramChatKind.Group => "Группа",
        TelegramChatKind.Supergroup => "Супергруппа",
        TelegramChatKind.Channel => "Канал",
        _ => "Неизвестно"
    };

    private static string FormatEventStatus(EventEditionStatus status) => status switch
    {
        EventEditionStatus.Draft => "Черновик",
        EventEditionStatus.Published => "Опубликовано",
        EventEditionStatus.RegistrationOpen => "Регистрация открыта",
        EventEditionStatus.RegistrationClosed => "Регистрация закрыта",
        EventEditionStatus.InProgress => "Идёт сейчас",
        EventEditionStatus.Completed => "Завершено",
        EventEditionStatus.Archived => "Архив",
        _ => status.ToString()
    };

    private static string FormatSubscriptionType(TelegramChatSubscriptionType type) => type switch
    {
        TelegramChatSubscriptionType.RegistrationSubmitted => "новые заявки",
        TelegramChatSubscriptionType.RegistrationStatusChanged => "смена статусов",
        TelegramChatSubscriptionType.RegistrationClosingSoon => "скорое закрытие регистрации",
        _ => type.ToString()
    };

    private static string FormatRegistrationStatus(RegistrationStatus status) => status switch
    {
        RegistrationStatus.Draft => "Черновик",
        RegistrationStatus.Submitted => "Отправлено",
        RegistrationStatus.Confirmed => "Подтверждено",
        RegistrationStatus.Cancelled => "Отменено",
        _ => status.ToString()
    };

    private static string BuildTelegramTestSuccessMessage(string? username, string telegramUserId)
    {
        var identity = !string.IsNullOrWhiteSpace(username)
            ? "@" + username.Trim().TrimStart('@')
            : telegramUserId.Trim();

        return $"Telegram: проверка прошла успешно. Бот получил пользователя {identity}.";
    }

    private static string? BuildDisplayName(string? firstName, string? lastName)
    {
        var parts = new[] { NormalizeValue(firstName), NormalizeValue(lastName) }
            .Where(item => !string.IsNullOrWhiteSpace(item));
        var displayName = string.Join(" ", parts);
        return NormalizeValue(displayName);
    }

    private static string? NormalizeValue(string? value)
    {
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static string? TrimToLength(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private readonly record struct TelegramParsedCommand(string Name, string? Arguments);

    private readonly record struct CommandResult(TelegramCommandLogStatus Status, string? Message)
    {
        public static CommandResult Handled(string? message) => new(TelegramCommandLogStatus.Handled, message);
        public static CommandResult Ignored(string? message) => new(TelegramCommandLogStatus.Ignored, message);
        public static CommandResult Forbidden(string? message) => new(TelegramCommandLogStatus.Forbidden, message);
    }

    private sealed record TelegramOperator(Guid UserId, string DisplayName, IReadOnlyCollection<string> Roles);

    private sealed record TelegramIncomingMessage(
        long ChatId,
        TelegramChatKind ChatKind,
        string? ChatTitle,
        string? ChatUsername,
        bool IsForum,
        long? MessageThreadId,
        string? Text,
        string? FromUserId,
        string? FromUsername,
        string? FromDisplayName);
}

public sealed partial class TelegramBotUpdateService
{
    private static readonly TelegramChatSubscriptionType[] DefaultSubscriptionTypes =
    [
        TelegramChatSubscriptionType.RegistrationSubmitted,
        TelegramChatSubscriptionType.RegistrationStatusChanged
    ];

    private async Task<TelegramChat> UpsertChatAsync(TelegramIncomingMessage message, CancellationToken cancellationToken)
    {
        var chat = await _dbContext.TelegramChats
            .FirstOrDefaultAsync(item => item.ChatId == message.ChatId, cancellationToken);

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var title = NormalizeValue(message.ChatTitle)
            ?? (message.ChatKind == TelegramChatKind.Private
                ? NormalizeValue(message.FromDisplayName) ?? NormalizeValue(message.FromUsername)
                : null);

        if (chat is null)
        {
            chat = new TelegramChat
            {
                Id = Guid.NewGuid(),
                ChatId = message.ChatId,
                Kind = message.ChatKind,
                Title = title,
                Username = NormalizeValue(message.ChatUsername),
                IsForum = message.IsForum,
                IsActive = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                LastSeenAtUtc = now
            };

            _dbContext.TelegramChats.Add(chat);
        }
        else
        {
            chat.Kind = message.ChatKind;
            chat.Title = title;
            chat.Username = NormalizeValue(message.ChatUsername);
            chat.IsForum = message.IsForum;
            chat.IsActive = true;
            chat.UpdatedAtUtc = now;
            chat.LastSeenAtUtc = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return chat;
    }

    private async Task<TelegramOperator?> ResolveOperatorAsync(string? telegramUserId, CancellationToken cancellationToken)
    {
        var normalizedTelegramUserId = NormalizeValue(telegramUserId);
        if (normalizedTelegramUserId is null)
        {
            return null;
        }

        var identity = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(item => item.Provider == "telegram" && item.ProviderUserId == normalizedTelegramUserId)
            .Select(item => new
            {
                item.UserId,
                item.DisplayName,
                item.ProviderUsername,
                item.ProviderUserId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (identity is null)
        {
            return null;
        }

        var roles = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where userRole.UserId == identity.UserId && role.Name != null
            select role.Name
        ).ToListAsync(cancellationToken);

        var displayName = NormalizeValue(identity.DisplayName)
            ?? (!string.IsNullOrWhiteSpace(identity.ProviderUsername) ? "@" + identity.ProviderUsername.Trim().TrimStart('@') : identity.ProviderUserId);

        return new TelegramOperator(identity.UserId, displayName, roles);
    }

    private async Task LogCommandAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        TelegramParsedCommand command,
        Guid? userId,
        TelegramCommandLogStatus status,
        string? responsePreview,
        CancellationToken cancellationToken)
    {
        _dbContext.TelegramCommandLogs.Add(new TelegramCommandLog
        {
            Id = Guid.NewGuid(),
            TelegramChatId = chat?.Id,
            TelegramUserId = long.TryParse(message.FromUserId, out var telegramUserId) ? telegramUserId : null,
            TelegramUsername = NormalizeValue(message.FromUsername),
            UserId = userId,
            Command = command.Name,
            Arguments = NormalizeValue(command.Arguments),
            Status = status,
            ResponsePreview = TrimToLength(NormalizeValue(responsePreview), 2000),
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private Task LogAuthEventAsync(Guid? userId, string provider, string eventType, string? detail)
    {
        _dbContext.AuthEvents.Add(new AuthEvent
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Provider = provider,
            EventType = eventType,
            Detail = detail,
            CreatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime
        });

        return Task.CompletedTask;
    }

    private async Task<TelegramParsedCommand?> ParseCommandAsync(string? text, CancellationToken cancellationToken)
    {
        var normalized = NormalizeValue(text);
        if (normalized is null || !normalized.StartsWith("/", StringComparison.Ordinal))
        {
            return null;
        }

        var firstSpaceIndex = normalized.IndexOf(' ');
        var commandToken = firstSpaceIndex >= 0 ? normalized[..firstSpaceIndex] : normalized;
        var arguments = firstSpaceIndex >= 0 ? NormalizeValue(normalized[(firstSpaceIndex + 1)..]) : null;
        var commandName = commandToken[1..];

        var mentionIndex = commandName.IndexOf('@');
        if (mentionIndex >= 0)
        {
            var targetBot = NormalizeValue(commandName[(mentionIndex + 1)..]);
            commandName = commandName[..mentionIndex];

            var botUsername = NormalizeValue(await _externalAuthProviderService.GetTelegramBotUsernameAsync(cancellationToken));
            if (targetBot is not null &&
                botUsername is not null &&
                !string.Equals(targetBot.TrimStart('@'), botUsername.TrimStart('@'), StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }
        }

        var normalizedCommandName = NormalizeValue(commandName)?.TrimStart('/').ToLowerInvariant();
        return string.IsNullOrWhiteSpace(normalizedCommandName)
            ? null
            : new TelegramParsedCommand(normalizedCommandName, arguments);
    }

    private async Task<string> BuildEventsTextAsync(CancellationToken cancellationToken)
    {
        var events = await _dbContext.EventEditions
            .AsNoTracking()
            .Include(item => item.EventSeries)
            .Where(item => item.EventSeries.IsActive && item.Status != EventEditionStatus.Archived && item.Status != EventEditionStatus.Draft)
            .OrderBy(item => item.StartsAtUtc)
            .Take(12)
            .ToListAsync(cancellationToken);

        if (events.Count == 0)
        {
            return "Сейчас нет опубликованных событий.";
        }

        var lines = new List<string> { "Актуальные события Blagodaty" };
        foreach (var eventItem in events)
        {
            lines.Add($"• {eventItem.Title}");
            lines.Add($"  slug: {eventItem.Slug}");
            lines.Add($"  статус: {FormatEventStatus(eventItem.Status)}");
            lines.Add($"  даты: {eventItem.StartsAtUtc:dd.MM.yyyy} - {eventItem.EndsAtUtc:dd.MM.yyyy}");
        }

        return string.Join("\n", lines);
    }
}

public sealed partial class TelegramBotUpdateService
{
    private async Task<CommandResult> HandleEventStatsAsync(
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
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        var total = registrations.Sum(item => item.Count);
        var draft = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Draft)?.Count ?? 0;
        var submitted = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Submitted)?.Count ?? 0;
        var confirmed = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Confirmed)?.Count ?? 0;
        var cancelled = registrations.FirstOrDefault(item => item.Status == RegistrationStatus.Cancelled)?.Count ?? 0;
        var occupied = submitted + confirmed;
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
            $"Всего заявок: {total}",
            $"Черновики: {draft}",
            $"Отправлено: {submitted}",
            $"Подтверждено: {confirmed}",
            $"Отменено: {cancelled}",
            $"Занято мест: {capacityText}",
            $"Осталось мест: {leftText}"
        }));
    }

    private async Task<CommandResult> HandleEventParticipantsAsync(
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

        var participants = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item => item.EventEditionId == eventItem.Id && item.Status == RegistrationStatus.Confirmed)
            .OrderBy(item => item.FullName)
            .Take(20)
            .Select(item => new
            {
                item.FullName,
                item.City,
                item.ChurchName
            })
            .ToListAsync(cancellationToken);

        if (participants.Count == 0)
        {
            return CommandResult.Handled($"По «{eventItem.Title}» пока нет подтверждённых участников.");
        }

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
            lines.Add($"• {participant.FullName}{suffix}");
        }

        return CommandResult.Handled(string.Join("\n", lines));
    }

    private async Task<CommandResult> HandleEventRegistrationsAsync(
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
            .Select(item => new
            {
                item.FullName,
                item.Status,
                item.City,
                item.UpdatedAtUtc
            })
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
            lines.Add($"• {registration.FullName} — {FormatRegistrationStatus(registration.Status)}{citySuffix} • {registration.UpdatedAtUtc:dd.MM HH:mm}");
        }

        return CommandResult.Handled(string.Join("\n", lines));
    }

    private async Task<CommandResult> HandleEventExportAsync(
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
            return CommandResult.Handled("Укажите slug события: /event_export <slug>.");
        }

        var export = await _eventRegistrationExportService.ExportBySlugAsync(slug, cancellationToken);
        if (export is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        try
        {
            var sent = await _externalAuthProviderService.SendTelegramDocumentAsync(
                message.ChatId,
                export.FilePath,
                export.FileName,
                $"Экспорт заявок по «{export.EventTitle}». Всего строк: {export.RegistrationsCount}.",
                message.MessageThreadId,
                cancellationToken);

            return sent
                ? CommandResult.Handled($"Excel-выгрузка по «{export.EventTitle}» отправлена в этот чат.")
                : CommandResult.Handled("Файл собран, но отправить его в Telegram не удалось.");
        }
        finally
        {
            try
            {
                if (File.Exists(export.FilePath))
                {
                    File.Delete(export.FilePath);
                }
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "Failed to clean up Telegram export file {FilePath}.", export.FilePath);
            }
        }
    }

    private async Task<CommandResult> HandleBindEventAsync(
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

        if (chat is null || (chat.Kind != TelegramChatKind.Group && chat.Kind != TelegramChatKind.Supergroup))
        {
            return CommandResult.Handled("Эту команду нужно запускать в групповом чате или супергруппе.");
        }

        var slug = NormalizeValue(arguments);
        if (slug is null)
        {
            return CommandResult.Handled("Укажите slug события: /bind_event <slug>.");
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (eventItem is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        var created = 0;
        var updated = 0;
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var threadId = message.MessageThreadId;

        foreach (var subscriptionType in DefaultSubscriptionTypes)
        {
            var existing = await _dbContext.TelegramChatSubscriptions
                .FirstOrDefaultAsync(item =>
                    item.TelegramChatId == chat.Id &&
                    item.EventEditionId == eventItem.Id &&
                    item.SubscriptionType == subscriptionType &&
                    item.MessageThreadId == threadId,
                    cancellationToken);

            if (existing is null)
            {
                _dbContext.TelegramChatSubscriptions.Add(new TelegramChatSubscription
                {
                    Id = Guid.NewGuid(),
                    TelegramChatId = chat.Id,
                    EventEditionId = eventItem.Id,
                    SubscriptionType = subscriptionType,
                    MessageThreadId = threadId,
                    CreatedByUserId = operatorUser!.UserId,
                    CreatedAtUtc = now,
                    UpdatedAtUtc = now,
                    IsEnabled = true
                });
                created++;
            }
            else if (!existing.IsEnabled)
            {
                existing.IsEnabled = true;
                existing.UpdatedAtUtc = now;
                updated++;
            }
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var threadSuffix = threadId.HasValue ? " для текущей темы" : string.Empty;
        return CommandResult.Handled(
            created + updated == 0
                ? $"Подписки на «{eventItem.Title}»{threadSuffix} уже активны."
                : $"Подписки на «{eventItem.Title}»{threadSuffix} сохранены. Новых: {created}, включено заново: {updated}.");
    }

    private async Task<CommandResult> HandleUnbindEventAsync(
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

        if (chat is null || (chat.Kind != TelegramChatKind.Group && chat.Kind != TelegramChatKind.Supergroup))
        {
            return CommandResult.Handled("Эту команду нужно запускать в групповом чате или супергруппе.");
        }

        var slug = NormalizeValue(arguments);
        if (slug is null)
        {
            return CommandResult.Handled("Укажите slug события: /unbind_event <slug>.");
        }

        var eventItem = await _dbContext.EventEditions
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.Slug == slug, cancellationToken);
        if (eventItem is null)
        {
            return CommandResult.Handled($"Событие со slug '{slug}' не найдено.");
        }

        var subscriptions = await _dbContext.TelegramChatSubscriptions
            .Where(item => item.TelegramChatId == chat.Id && item.EventEditionId == eventItem.Id && item.IsEnabled)
            .ToListAsync(cancellationToken);

        if (subscriptions.Count == 0)
        {
            return CommandResult.Handled($"Для «{eventItem.Title}» в этом чате нет активных подписок.");
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        foreach (var subscription in subscriptions)
        {
            subscription.IsEnabled = false;
            subscription.UpdatedAtUtc = now;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
        return CommandResult.Handled($"Подписки на «{eventItem.Title}» выключены для этого чата.");
    }

    private async Task<CommandResult> HandleSubscriptionsAsync(
        TelegramChat? chat,
        TelegramIncomingMessage message,
        TelegramOperator? operatorUser,
        CancellationToken cancellationToken)
    {
        var accessError = await EnsureManagementAccessAsync(chat, message, operatorUser, cancellationToken);
        if (accessError is not null)
        {
            return accessError.Value;
        }

        if (chat is null)
        {
            return CommandResult.Handled("Чат пока не распознан ботом.");
        }

        var subscriptions = await _dbContext.TelegramChatSubscriptions
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .Where(item => item.TelegramChatId == chat.Id && item.IsEnabled)
            .OrderBy(item => item.EventEdition.Title)
            .ThenBy(item => item.SubscriptionType)
            .ToListAsync(cancellationToken);

        if (subscriptions.Count == 0)
        {
            return CommandResult.Handled("Для этого чата пока нет активных подписок на события.");
        }

        var lines = new List<string>
        {
            $"Активные подписки чата «{chat.Title ?? chat.ChatId.ToString()}»"
        };

        foreach (var group in subscriptions.GroupBy(item => new
                 {
                     item.EventEditionId,
                     item.EventEdition.Title
                 }))
        {
            var types = string.Join(", ", group.Select(item => FormatSubscriptionType(item.SubscriptionType)));
            var topicText = group.Any(item => item.MessageThreadId.HasValue) ? " (включая темы)" : string.Empty;
            lines.Add($"• {group.Key.Title}: {types}{topicText}");
        }

        return CommandResult.Handled(string.Join("\n", lines));
    }
}
