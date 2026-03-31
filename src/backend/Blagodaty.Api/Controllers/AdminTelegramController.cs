using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Route("api/admin/telegram")]
[Authorize(Roles = AppRoles.Admin)]
public sealed class AdminTelegramController : ControllerBase
{
    private readonly AppDbContext _dbContext;

    public AdminTelegramController(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet("overview")]
    public async Task<ActionResult<AdminTelegramOverviewResponse>> GetOverview(CancellationToken cancellationToken)
    {
        var chatsTask = _dbContext.TelegramChats
            .AsNoTracking()
            .Include(item => item.Subscriptions)
                .ThenInclude(item => item.EventEdition)
            .Include(item => item.Subscriptions)
                .ThenInclude(item => item.CreatedByUser)
            .OrderByDescending(item => item.LastSeenAtUtc ?? item.CreatedAtUtc)
            .ThenBy(item => item.Title)
            .ToListAsync(cancellationToken);

        var commandsTask = _dbContext.TelegramCommandLogs
            .AsNoTracking()
            .Include(item => item.Chat)
            .Include(item => item.User)
            .OrderByDescending(item => item.CreatedAtUtc)
            .Take(50)
            .ToListAsync(cancellationToken);

        var eventsTask = _dbContext.EventEditions
            .AsNoTracking()
            .Where(item => item.Status != EventEditionStatus.Archived)
            .OrderByDescending(item => item.StartsAtUtc)
            .Take(100)
            .Select(item => new AdminTelegramEventOptionDto
            {
                Id = item.Id,
                Slug = item.Slug,
                Title = item.Title,
                Status = item.Status
            })
            .ToListAsync(cancellationToken);

        await Task.WhenAll(chatsTask, commandsTask, eventsTask);

        var chats = chatsTask.Result;
        var commands = commandsTask.Result;
        var events = eventsTask.Result;

        return Ok(new AdminTelegramOverviewResponse
        {
            Summary = new AdminTelegramSummaryDto
            {
                TotalChats = chats.Count,
                ActiveChats = chats.Count(item => item.IsActive),
                TotalSubscriptions = chats.Sum(item => item.Subscriptions.Count),
                RecentCommandsCount = commands.Count
            },
            Events = events,
            Chats = chats.Select(MapChat).ToArray(),
            RecentCommands = commands.Select(MapCommand).ToArray()
        });
    }

    [HttpPost("subscriptions")]
    public async Task<ActionResult<AdminTelegramChatSubscriptionDto>> CreateSubscription(
        [FromBody] CreateAdminTelegramSubscriptionRequest request,
        CancellationToken cancellationToken)
    {
        var chat = await _dbContext.TelegramChats.FirstOrDefaultAsync(item => item.Id == request.TelegramChatId, cancellationToken);
        if (chat is null)
        {
            return NotFound(new { message = "Telegram chat not found." });
        }

        var eventItem = await _dbContext.EventEditions.FirstOrDefaultAsync(item => item.Id == request.EventEditionId, cancellationToken);
        if (eventItem is null)
        {
            return NotFound(new { message = "Event not found." });
        }

        var currentUserId = TryGetCurrentUserId();
        var existing = await _dbContext.TelegramChatSubscriptions
            .Include(item => item.EventEdition)
            .Include(item => item.CreatedByUser)
            .FirstOrDefaultAsync(item =>
                item.TelegramChatId == request.TelegramChatId &&
                item.EventEditionId == request.EventEditionId &&
                item.SubscriptionType == request.SubscriptionType &&
                item.MessageThreadId == request.MessageThreadId,
                cancellationToken);

        if (existing is not null)
        {
            existing.IsEnabled = request.IsEnabled;
            existing.UpdatedAtUtc = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
            return Ok(MapSubscription(existing));
        }

        var subscription = new TelegramChatSubscription
        {
            Id = Guid.NewGuid(),
            TelegramChatId = request.TelegramChatId,
            EventEditionId = request.EventEditionId,
            SubscriptionType = request.SubscriptionType,
            MessageThreadId = request.MessageThreadId,
            IsEnabled = request.IsEnabled,
            CreatedByUserId = currentUserId,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        };

        _dbContext.TelegramChatSubscriptions.Add(subscription);
        await _dbContext.SaveChangesAsync(cancellationToken);

        await _dbContext.Entry(subscription).Reference(item => item.EventEdition).LoadAsync(cancellationToken);
        if (subscription.CreatedByUserId.HasValue)
        {
            await _dbContext.Entry(subscription).Reference(item => item.CreatedByUser).LoadAsync(cancellationToken);
        }

        return Ok(MapSubscription(subscription));
    }

    [HttpPut("subscriptions/{subscriptionId:guid}")]
    public async Task<ActionResult<AdminTelegramChatSubscriptionDto>> UpdateSubscription(
        [FromRoute] Guid subscriptionId,
        [FromBody] UpdateAdminTelegramSubscriptionRequest request,
        CancellationToken cancellationToken)
    {
        var subscription = await _dbContext.TelegramChatSubscriptions
            .Include(item => item.EventEdition)
            .Include(item => item.CreatedByUser)
            .FirstOrDefaultAsync(item => item.Id == subscriptionId, cancellationToken);
        if (subscription is null)
        {
            return NotFound(new { message = "Subscription not found." });
        }

        subscription.IsEnabled = request.IsEnabled;
        subscription.MessageThreadId = request.MessageThreadId;
        subscription.UpdatedAtUtc = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(MapSubscription(subscription));
    }

    [HttpDelete("subscriptions/{subscriptionId:guid}")]
    public async Task<ActionResult<object>> DeleteSubscription([FromRoute] Guid subscriptionId, CancellationToken cancellationToken)
    {
        var subscription = await _dbContext.TelegramChatSubscriptions
            .FirstOrDefaultAsync(item => item.Id == subscriptionId, cancellationToken);
        if (subscription is null)
        {
            return NotFound(new { message = "Subscription not found." });
        }

        _dbContext.TelegramChatSubscriptions.Remove(subscription);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { ok = true });
    }

    [HttpPut("chats/{chatId:guid}")]
    public async Task<ActionResult<AdminTelegramChatDto>> UpdateChat(
        [FromRoute] Guid chatId,
        [FromBody] UpdateAdminTelegramChatRequest request,
        CancellationToken cancellationToken)
    {
        var chat = await _dbContext.TelegramChats
            .Include(item => item.Subscriptions)
                .ThenInclude(item => item.EventEdition)
            .Include(item => item.Subscriptions)
                .ThenInclude(item => item.CreatedByUser)
            .FirstOrDefaultAsync(item => item.Id == chatId, cancellationToken);
        if (chat is null)
        {
            return NotFound(new { message = "Telegram chat not found." });
        }

        chat.IsActive = request.IsActive;
        chat.UpdatedAtUtc = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Ok(MapChat(chat));
    }

    private Guid? TryGetCurrentUserId()
    {
        var userIdValue = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(userIdValue, out var userId) ? userId : null;
    }

    private static AdminTelegramChatDto MapChat(TelegramChat chat)
    {
        return new AdminTelegramChatDto
        {
            Id = chat.Id,
            ChatId = chat.ChatId,
            Kind = chat.Kind,
            Title = chat.Title,
            Username = chat.Username,
            IsForum = chat.IsForum,
            IsActive = chat.IsActive,
            CreatedAtUtc = chat.CreatedAtUtc,
            UpdatedAtUtc = chat.UpdatedAtUtc,
            LastSeenAtUtc = chat.LastSeenAtUtc,
            Subscriptions = chat.Subscriptions
                .OrderBy(item => item.EventEdition.Title)
                .ThenBy(item => item.SubscriptionType)
                .ThenBy(item => item.MessageThreadId)
                .Select(MapSubscription)
                .ToArray()
        };
    }

    private static AdminTelegramChatSubscriptionDto MapSubscription(TelegramChatSubscription subscription)
    {
        return new AdminTelegramChatSubscriptionDto
        {
            Id = subscription.Id,
            EventEditionId = subscription.EventEditionId,
            EventSlug = subscription.EventEdition.Slug,
            EventTitle = subscription.EventEdition.Title,
            SubscriptionType = subscription.SubscriptionType,
            IsEnabled = subscription.IsEnabled,
            MessageThreadId = subscription.MessageThreadId,
            CreatedByUserId = subscription.CreatedByUserId,
            CreatedByDisplayName = subscription.CreatedByUser?.DisplayName,
            CreatedAtUtc = subscription.CreatedAtUtc,
            UpdatedAtUtc = subscription.UpdatedAtUtc
        };
    }

    private static AdminTelegramCommandLogDto MapCommand(TelegramCommandLog item)
    {
        return new AdminTelegramCommandLogDto
        {
            Id = item.Id,
            TelegramChatId = item.TelegramChatId,
            ChatTitle = item.Chat?.Title,
            ChatExternalId = item.Chat?.ChatId,
            TelegramUserId = item.TelegramUserId,
            TelegramUsername = item.TelegramUsername,
            UserId = item.UserId,
            UserDisplayName = item.User?.DisplayName,
            Command = item.Command,
            Arguments = item.Arguments,
            Status = item.Status,
            ResponsePreview = item.ResponsePreview,
            CreatedAtUtc = item.CreatedAtUtc
        };
    }
}
