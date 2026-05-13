using Blagodaty.Api.Contracts.Admin;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Blagodaty.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace Blagodaty.Api.Controllers;

[ApiController]
[Authorize(Roles = AppRoles.Admin)]
[Route("api/admin")]
public sealed class AdminController : ControllerBase
{
    private const int DefaultPageSize = 20;
    private const int MaxPageSize = 100;

    private readonly AppDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly EventCatalogService _eventCatalogService;
    private readonly UserNotificationService _userNotificationService;
    private readonly TimeProvider _timeProvider;
    private readonly GoogleSheetsRegistrationSyncService _googleSheetsSyncService;

    public AdminController(
        AppDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        EventCatalogService eventCatalogService,
        UserNotificationService userNotificationService,
        TimeProvider timeProvider,
        GoogleSheetsRegistrationSyncService googleSheetsSyncService)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _eventCatalogService = eventCatalogService;
        _userNotificationService = userNotificationService;
        _timeProvider = timeProvider;
        _googleSheetsSyncService = googleSheetsSyncService;
    }

    [HttpGet("overview")]
    public async Task<ActionResult<AdminOverviewResponse>> GetOverview()
    {
        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var totalUsersTask = _dbContext.Users.AsNoTracking().CountAsync();
        var registrationStatsTask = activeCampEditionId is null
            ? Task.FromResult<RegistrationStatsSummary?>(null)
            : _dbContext.CampRegistrations
                .AsNoTracking()
                .Where(registration => registration.EventEditionId == activeCampEditionId)
                .GroupBy(_ => 1)
                .Select(group => new RegistrationStatsSummary
                {
                    TotalRegistrations = group.Count(),
                    SubmittedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Submitted),
                    ConfirmedRegistrations = group.Count(registration => registration.Status == RegistrationStatus.Confirmed)
                })
                .FirstOrDefaultAsync();

        var roleAssignments = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            join user in _dbContext.Users.AsNoTracking() on userRole.UserId equals user.Id
            where role.Name != null && !string.IsNullOrWhiteSpace(user.DisplayName)
            select new
            {
                RoleName = role.Name!,
                user.DisplayName
            }
        ).ToListAsync();

        await Task.WhenAll(totalUsersTask, registrationStatsTask);

        var registrationStats = registrationStatsTask.Result;
        var roleAssignmentsByName = roleAssignments
            .GroupBy(row => row.RoleName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<string>)group
                    .Select(row => row.DisplayName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray());

        return Ok(new AdminOverviewResponse
        {
            Stats = new AdminStatsDto
            {
                TotalUsers = totalUsersTask.Result,
                TotalRegistrations = registrationStats?.TotalRegistrations ?? 0,
                SubmittedRegistrations = registrationStats?.SubmittedRegistrations ?? 0,
                ConfirmedRegistrations = registrationStats?.ConfirmedRegistrations ?? 0
            },
            Roles = AppRoles.Definitions
                .Select(definition => new AdminRoleDto
                {
                    Id = definition.Name,
                    Title = definition.Title,
                    Description = definition.Description,
                    AssignedUserCount = roleAssignmentsByName.GetValueOrDefault(definition.Name, Array.Empty<string>()).Count,
                    MemberDisplayNames = roleAssignmentsByName.GetValueOrDefault(definition.Name, Array.Empty<string>())
                        .Take(6)
                        .ToArray()
                })
                .ToArray()
        });
    }

    [HttpGet("users")]
    public async Task<ActionResult<AdminPagedResponse<AdminUserDto>>> GetUsers([FromQuery] AdminUsersQueryRequest request)
    {
        var page = NormalizePage(request.Page);
        var pageSize = NormalizePageSize(request.PageSize);
        var users = ApplyUserSearch(_dbContext.Users.AsNoTracking(), request.Search);

        if (!string.IsNullOrWhiteSpace(request.Role))
        {
            var resolvedRole = AppRoles.Resolve(request.Role);
            if (resolvedRole is null)
            {
                return BadRequest(new { message = "Неизвестная роль для фильтра пользователей." });
            }

            var roleId = await _dbContext.Roles
                .AsNoTracking()
                .Where(role => role.Name == resolvedRole)
                .Select(role => (Guid?)role.Id)
                .FirstOrDefaultAsync();

            if (roleId is null)
            {
                return Ok(CreatePagedResponse(page, pageSize, 0, Array.Empty<AdminUserDto>()));
            }

            users = users.Where(user => _dbContext.UserRoles.Any(userRole => userRole.UserId == user.Id && userRole.RoleId == roleId.Value));
        }

        var totalItems = await users.CountAsync();
        var totalPages = CalculateTotalPages(totalItems, pageSize);
        page = Math.Min(page, totalPages);

        var items = await users
            .OrderByDescending(user => user.CreatedAtUtc)
            .ThenBy(user => user.DisplayName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var mappedItems = await MapAdminUsersAsync(
            items,
            eventEditionId: activeCampEditionId,
            orderedUserIds: items.Select(user => user.Id).ToArray());
        return Ok(CreatePagedResponse(page, pageSize, totalItems, mappedItems));
    }

    [HttpGet("registrations")]
    public async Task<ActionResult<AdminPagedResponse<AdminUserDto>>> GetRegistrations([FromQuery] AdminRegistrationsQueryRequest request)
    {
        var page = NormalizePage(request.Page);
        var pageSize = NormalizePageSize(request.PageSize);
        var registrations = _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration => registration.EventEditionId != null);

        if (request.EventEditionId is not null)
        {
            registrations = registrations.Where(registration => registration.EventEditionId == request.EventEditionId);
        }

        registrations = ApplyRegistrationSearch(registrations, request.Search);

        if (request.Status is not null)
        {
            registrations = registrations.Where(registration => registration.Status == request.Status.Value);
        }

        var totalItems = await registrations.CountAsync();
        var totalPages = CalculateTotalPages(totalItems, pageSize);
        page = Math.Min(page, totalPages);

        var pagedRegistrations = await SelectRegistrationListItems(
                registrations
                    .OrderByDescending(registration => registration.UpdatedAtUtc)
                    .ThenByDescending(registration => registration.CreatedAtUtc)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize))
            .ToListAsync();

        var orderedUserIds = pagedRegistrations
            .Select(registration => registration.UserId)
            .ToArray();

        if (orderedUserIds.Length == 0)
        {
            return Ok(CreatePagedResponse(page, pageSize, totalItems, Array.Empty<AdminUserDto>()));
        }

        var users = await _dbContext.Users
            .AsNoTracking()
            .Where(user => orderedUserIds.Contains(user.Id))
            .ToListAsync();

        var registrationByUserId = pagedRegistrations
            .GroupBy(registration => registration.UserId)
            .ToDictionary(
                group => group.Key,
                group => group.First());

        var mappedItems = await MapAdminUsersAsync(users, registrationByUserId, orderedUserIds: orderedUserIds);
        return Ok(CreatePagedResponse(page, pageSize, totalItems, mappedItems));
    }

    [HttpPut("users/{userId:guid}/roles")]
    public async Task<ActionResult<AdminUserDto>> UpdateUserRoles(Guid userId, [FromBody] UpdateUserRolesRequest request)
    {
        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId);
        if (user is null)
        {
            return NotFound();
        }

        var requestedRoles = request.Roles
            .Select(AppRoles.Resolve)
            .Where(role => role is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (requestedRoles.Count == 0)
        {
            requestedRoles.Add(AppRoles.Member);
        }

        if ((requestedRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase) ||
             requestedRoles.Contains(AppRoles.CampManager, StringComparer.OrdinalIgnoreCase)) &&
            !requestedRoles.Contains(AppRoles.Member, StringComparer.OrdinalIgnoreCase))
        {
            requestedRoles.Insert(0, AppRoles.Member);
        }

        var currentRoles = (await _userManager.GetRolesAsync(user)).ToArray();
        var isRemovingAdmin = currentRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase) &&
            !requestedRoles.Contains(AppRoles.Admin, StringComparer.OrdinalIgnoreCase);

        if (isRemovingAdmin)
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Admin);
            if (adminUsers.Count <= 1)
            {
                return BadRequest(new { message = "Нельзя снять роль администратора у последнего администратора системы." });
            }
        }

        var rolesToRemove = currentRoles.Except(requestedRoles, StringComparer.OrdinalIgnoreCase).ToArray();
        if (rolesToRemove.Length > 0)
        {
            var removeResult = await _userManager.RemoveFromRolesAsync(user, rolesToRemove);
            if (!removeResult.Succeeded)
            {
                return BuildIdentityProblem(removeResult);
            }
        }

        var rolesToAdd = requestedRoles.Except(currentRoles, StringComparer.OrdinalIgnoreCase).ToArray();
        if (rolesToAdd.Length > 0)
        {
            var addResult = await _userManager.AddToRolesAsync(user, rolesToAdd);
            if (!addResult.Succeeded)
            {
                return BuildIdentityProblem(addResult);
            }
        }

        var refreshedUser = await _dbContext.Users
            .AsNoTracking()
            .FirstAsync(item => item.Id == user.Id);

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var mappedUser = await MapAdminUsersAsync(
            [refreshedUser],
            eventEditionId: activeCampEditionId,
            orderedUserIds: [refreshedUser.Id]);

        return Ok(mappedUser.Single());
    }

    [HttpPut("users/{userId:guid}")]
    public async Task<ActionResult<AdminUserDto>> UpdateUser(Guid userId, [FromBody] UpdateAdminUserRequest request)
    {
        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId);
        if (user is null)
        {
            return NotFound();
        }

        user.FirstName = request.FirstName?.Trim() ?? string.Empty;
        user.LastName = request.LastName?.Trim() ?? string.Empty;
        user.Patronymic = string.IsNullOrWhiteSpace(request.Patronymic) ? null : request.Patronymic.Trim();
        user.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? BuildDisplayName(request.FirstName, request.LastName, user.Email)
            : request.DisplayName.Trim();
        user.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        user.City = string.IsNullOrWhiteSpace(request.City) ? null : request.City.Trim();
        user.ChurchName = string.IsNullOrWhiteSpace(request.ChurchName) ? null : request.ChurchName.Trim();

        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
        {
            return BuildIdentityProblem(result);
        }

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var mappedUser = await MapAdminUsersAsync([user], eventEditionId: activeCampEditionId, orderedUserIds: [user.Id]);
        return Ok(mappedUser.Single());
    }

    [HttpDelete("users/{userId:guid}")]
    public async Task<IActionResult> DeleteUser(Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == userId)
        {
            return BadRequest(new { message = "Нельзя удалить текущий аккаунт администратора." });
        }

        var user = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == userId);
        if (user is null)
        {
            return NotFound();
        }

        if (await _userManager.IsInRoleAsync(user, AppRoles.Admin))
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Admin);
            if (adminUsers.Count <= 1)
            {
                return BadRequest(new { message = "Нельзя удалить последнего администратора системы." });
            }
        }

        var eventIdsToSync = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration => registration.UserId == userId && registration.EventEditionId != null)
            .Select(registration => registration.EventEditionId)
            .Distinct()
            .ToListAsync();

        var result = await _userManager.DeleteAsync(user);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = string.Join(" ", result.Errors.Select(error => error.Description)) });
        }

        foreach (var eventEditionId in eventIdsToSync)
        {
            await _googleSheetsSyncService.TrySyncRegistrationEventAsync(eventEditionId, HttpContext.RequestAborted);
        }
        return NoContent();
    }

    [HttpPut("registrations/{registrationId:guid}/user")]
    public async Task<ActionResult<AdminUserDto>> LinkRegistrationToUser(Guid registrationId, [FromBody] LinkRegistrationToUserRequest request)
    {
        var registration = await _dbContext.CampRegistrations.FirstOrDefaultAsync(item => item.Id == registrationId);
        if (registration is null)
        {
            return NotFound();
        }

        var targetUser = await _dbContext.Users.FirstOrDefaultAsync(item => item.Id == request.UserId);
        if (targetUser is null)
        {
            return BadRequest(new { message = "Пользователь для привязки не найден." });
        }

        var previousUserId = registration.UserId;
        registration.UserId = targetUser.Id;
        registration.UpdatedAtUtc = _timeProvider.GetUtcNow().UtcDateTime;
        await AddRegistrationHistoryAsync(
            registration.Id,
            "User",
            previousUserId.ToString(),
            targetUser.Id.ToString(),
            registration.UpdatedAtUtc,
            HttpContext.RequestAborted);

        await _dbContext.SaveChangesAsync();
        await _googleSheetsSyncService.TrySyncRegistrationEventAsync(registration.EventEditionId, HttpContext.RequestAborted);

        var mappedUser = await MapAdminUsersAsync([targetUser], new Dictionary<Guid, RegistrationListItem>
        {
            [targetUser.Id] = await SelectRegistrationListItems(_dbContext.CampRegistrations.AsNoTracking().Where(item => item.Id == registration.Id)).SingleAsync()
        }, orderedUserIds: [targetUser.Id]);
        return Ok(mappedUser.Single());
    }

    [HttpPost("users/{sourceUserId:guid}/merge")]
    public async Task<ActionResult<AdminUserDto>> MergeUsers(Guid sourceUserId, [FromBody] MergeUsersRequest request)
    {
        if (sourceUserId == request.TargetUserId)
        {
            return BadRequest(new { message = "Выберите другого пользователя для объединения." });
        }

        var currentUserId = GetCurrentUserId();
        if (sourceUserId == currentUserId)
        {
            return BadRequest(new { message = "Нельзя объединить текущий аккаунт администратора в другой аккаунт." });
        }

        var sourceUser = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == sourceUserId);
        var targetUser = await _userManager.Users.FirstOrDefaultAsync(item => item.Id == request.TargetUserId);
        if (sourceUser is null || targetUser is null)
        {
            return BadRequest(new { message = "Исходный или целевой пользователь не найден." });
        }

        if (await _userManager.IsInRoleAsync(sourceUser, AppRoles.Admin))
        {
            var adminUsers = await _userManager.GetUsersInRoleAsync(AppRoles.Admin);
            if (adminUsers.Count <= 1)
            {
                return BadRequest(new { message = "Нельзя объединить последнего администратора в другой аккаунт." });
            }
        }

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var sourceRegistrations = await _dbContext.CampRegistrations
            .Where(registration => registration.UserId == sourceUserId)
            .ToListAsync();
        var eventIdsToSync = sourceRegistrations
            .Select(registration => registration.EventEditionId)
            .Where(eventEditionId => eventEditionId != null)
            .Distinct()
            .ToArray();
        foreach (var registration in sourceRegistrations)
        {
            registration.UserId = targetUser.Id;
            registration.UpdatedAtUtc = now;
            await AddRegistrationHistoryAsync(
                registration.Id,
                "UserMerge",
                sourceUser.Id.ToString(),
                targetUser.Id.ToString(),
                now,
                HttpContext.RequestAborted);
        }

        await _dbContext.UserExternalIdentities
            .Where(identity => identity.UserId == sourceUserId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(identity => identity.UserId, targetUser.Id));
        await _dbContext.UserNotifications
            .Where(notification => notification.UserId == sourceUserId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(notification => notification.UserId, targetUser.Id));

        await _dbContext.SaveChangesAsync();

        var deleteResult = await _userManager.DeleteAsync(sourceUser);
        if (!deleteResult.Succeeded)
        {
            return BuildIdentityProblem(deleteResult);
        }

        foreach (var eventEditionId in eventIdsToSync)
        {
            await _googleSheetsSyncService.TrySyncRegistrationEventAsync(eventEditionId, HttpContext.RequestAborted);
        }

        var activeCampEditionId = await _eventCatalogService.GetActiveCampEditionIdAsync(HttpContext.RequestAborted);
        var mappedUser = await MapAdminUsersAsync([targetUser], eventEditionId: activeCampEditionId, orderedUserIds: [targetUser.Id]);
        return Ok(mappedUser.Single());
    }

    [HttpPut("registrations/{registrationId:guid}/status")]
    public async Task<ActionResult<AdminUserDto>> UpdateRegistrationStatus(
        Guid registrationId,
        [FromBody] UpdateRegistrationStatusRequest request)
    {
        var registration = await _dbContext.CampRegistrations
            .Include(item => item.Participants)
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .FirstOrDefaultAsync(item => item.Id == registrationId, HttpContext.RequestAborted);

        if (registration is null)
        {
            return NotFound();
        }

        var previousStatus = registration.Status;
        if (previousStatus != request.Status)
        {
            if (request.Status == RegistrationStatus.Confirmed)
            {
                var capacityError = await ValidateConfirmationCapacityAsync(registration, HttpContext.RequestAborted);
                if (capacityError is not null)
                {
                    return BadRequest(new { message = capacityError });
                }
            }

            var now = _timeProvider.GetUtcNow().UtcDateTime;
            registration.Status = request.Status;
            registration.UpdatedAtUtc = now;
            await AddRegistrationHistoryAsync(
                registration.Id,
                "Status",
                previousStatus.ToString(),
                request.Status.ToString(),
                now,
                HttpContext.RequestAborted);

            if (request.Status == RegistrationStatus.Draft)
            {
                registration.SubmittedAtUtc = null;
            }
            else if (request.Status is RegistrationStatus.Submitted or RegistrationStatus.Confirmed)
            {
                registration.SubmittedAtUtc ??= now;
            }

            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

            registration = await _dbContext.CampRegistrations
                .AsNoTracking()
                .Include(item => item.EventEdition)
                .ThenInclude(item => item!.EventSeries)
                .FirstAsync(item => item.Id == registrationId, HttpContext.RequestAborted);

            await _userNotificationService.NotifyRegistrationStatusChangedAsync(
                registration,
                previousStatus,
                HttpContext.RequestAborted);

            await _googleSheetsSyncService.TrySyncRegistrationEventAsync(
                registration.EventEditionId,
                HttpContext.RequestAborted);
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .FirstAsync(item => item.Id == registration.UserId, HttpContext.RequestAborted);

        var registrationListItem = await SelectRegistrationListItems(
                _dbContext.CampRegistrations
                    .AsNoTracking()
                    .Where(item => item.Id == registration.Id))
            .FirstAsync(HttpContext.RequestAborted);

        var mappedUser = await MapAdminUsersAsync(
            [user],
            registrationsByUserId: new Dictionary<Guid, RegistrationListItem>
            {
                [registrationListItem.UserId] = registrationListItem
            },
            orderedUserIds: [user.Id]);

        return Ok(mappedUser.Single());
    }

    [HttpPut("registrations/{registrationId:guid}/payment")]
    public async Task<ActionResult<AdminUserDto>> UpdateRegistrationPayment(
        Guid registrationId,
        [FromBody] UpdateRegistrationPaymentRequest request)
    {
        var registration = await _dbContext.CampRegistrations
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .FirstOrDefaultAsync(item => item.Id == registrationId, HttpContext.RequestAborted);

        if (registration is null)
        {
            return NotFound();
        }

        if (registration.IsPaid != request.IsPaid)
        {
            var now = _timeProvider.GetUtcNow().UtcDateTime;
            var actor = await _userManager.GetUserAsync(User);
            registration.IsPaid = request.IsPaid;
            registration.PaidAtUtc = request.IsPaid ? now : null;
            registration.PaymentUpdatedByUserId = actor?.Id;
            registration.UpdatedAtUtc = now;

            await AddRegistrationHistoryAsync(
                registration.Id,
                "Payment",
                request.IsPaid ? "Не оплачено" : "Оплачено",
                request.IsPaid ? "Оплачено" : "Не оплачено",
                now,
                HttpContext.RequestAborted);

            await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);
            await _googleSheetsSyncService.TrySyncRegistrationEventAsync(registration.EventEditionId, HttpContext.RequestAborted);
        }

        var user = await _dbContext.Users
            .AsNoTracking()
            .FirstAsync(item => item.Id == registration.UserId, HttpContext.RequestAborted);

        var registrationListItem = await SelectRegistrationListItems(
                _dbContext.CampRegistrations
                    .AsNoTracking()
                    .Where(item => item.Id == registration.Id))
            .FirstAsync(HttpContext.RequestAborted);

        var mappedUser = await MapAdminUsersAsync(
            [user],
            registrationsByUserId: new Dictionary<Guid, RegistrationListItem>
            {
                [registrationListItem.UserId] = registrationListItem
            },
            orderedUserIds: [user.Id]);

        return Ok(mappedUser.Single());
    }

    [HttpDelete("registrations/{registrationId:guid}")]
    public async Task<IActionResult> DeleteRegistration(Guid registrationId)
    {
        var registration = await _dbContext.CampRegistrations
            .FirstOrDefaultAsync(item => item.Id == registrationId, HttpContext.RequestAborted);

        if (registration is null)
        {
            return NotFound();
        }

        var eventEditionId = registration.EventEditionId;
        _dbContext.CampRegistrations.Remove(registration);
        await _dbContext.SaveChangesAsync(HttpContext.RequestAborted);

        await _googleSheetsSyncService.TrySyncRegistrationEventAsync(eventEditionId, HttpContext.RequestAborted);

        return NoContent();
    }

    private ActionResult<AdminUserDto> BuildIdentityProblem(IdentityResult result)
    {
        foreach (var error in result.Errors)
        {
            ModelState.AddModelError(error.Code, error.Description);
        }

        return ValidationProblem(ModelState);
    }

    private static int GetRoleSortOrder(string roleName)
    {
        return roleName switch
        {
            AppRoles.Member => 0,
            AppRoles.CampManager => 1,
            AppRoles.Admin => 2,
            _ => 10
        };
    }

    private async Task<string?> ValidateConfirmationCapacityAsync(CampRegistration registration, CancellationToken cancellationToken)
    {
        if (registration.EventEditionId is null || registration.EventEdition?.Capacity is not int capacity)
        {
            return null;
        }

        var occupiedSeats = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item =>
                item.EventEditionId == registration.EventEditionId &&
                item.Id != registration.Id &&
                item.Status == RegistrationStatus.Confirmed)
            .SumAsync(item => item.ParticipantsCount, cancellationToken);

        var requestedSeats = EventRegistrationService.GetParticipantsCount(registration);
        if (occupiedSeats + requestedSeats <= capacity)
        {
            return null;
        }

        var remainingSeats = Math.Max(capacity - occupiedSeats, 0);
        return $"Нельзя подтвердить заявку: свободных мест {remainingSeats}, в заявке {requestedSeats}.";
    }

    private IQueryable<ApplicationUser> ApplyUserSearch(IQueryable<ApplicationUser> query, string? search)
    {
        var pattern = BuildSearchPattern(search);
        if (pattern is null)
        {
            return query;
        }

        return query.Where(user =>
            EF.Functions.ILike(user.DisplayName, pattern) ||
            EF.Functions.ILike(user.FirstName, pattern) ||
            EF.Functions.ILike(user.LastName, pattern) ||
            (user.Email != null && EF.Functions.ILike(user.Email, pattern)) ||
            (user.City != null && EF.Functions.ILike(user.City, pattern)) ||
            (user.ChurchName != null && EF.Functions.ILike(user.ChurchName, pattern)));
    }

    private IQueryable<CampRegistration> ApplyRegistrationSearch(IQueryable<CampRegistration> query, string? search)
    {
        var pattern = BuildSearchPattern(search);
        if (pattern is null)
        {
            return query;
        }

        return query.Where(registration =>
            EF.Functions.ILike(registration.User.DisplayName, pattern) ||
            EF.Functions.ILike(registration.User.FirstName, pattern) ||
            EF.Functions.ILike(registration.User.LastName, pattern) ||
            (registration.User.Email != null && EF.Functions.ILike(registration.User.Email, pattern)) ||
            EF.Functions.ILike(registration.ContactEmail, pattern) ||
            EF.Functions.ILike(registration.FullName, pattern) ||
            EF.Functions.ILike(registration.PhoneNumber, pattern) ||
            EF.Functions.ILike(registration.City, pattern) ||
            EF.Functions.ILike(registration.ChurchName, pattern) ||
            EF.Functions.ILike(registration.EmergencyContactName, pattern) ||
            EF.Functions.ILike(registration.EmergencyContactPhone, pattern) ||
            registration.Participants.Any(participant => EF.Functions.ILike(participant.FullName, pattern)));
    }

    private async Task<IReadOnlyCollection<AdminUserDto>> MapAdminUsersAsync(
        IReadOnlyCollection<ApplicationUser> users,
        IReadOnlyDictionary<Guid, RegistrationListItem>? registrationsByUserId = null,
        Guid? eventEditionId = null,
        IReadOnlyCollection<Guid>? orderedUserIds = null)
    {
        if (users.Count == 0)
        {
            return Array.Empty<AdminUserDto>();
        }

        var userIds = users.Select(user => user.Id).ToArray();
        var userIdSet = userIds.ToHashSet();
        var usersById = users.ToDictionary(user => user.Id);
        var rolesByUserId = await GetRolesByUserIdAsync(userIds);
        var registrations = registrationsByUserId is null
            ? await GetRegistrationsByUserIdAsync(userIds, eventEditionId)
            : registrationsByUserId;
        var externalIdentitiesByUserId = await GetExternalIdentitiesByUserIdAsync(userIds);
        var finalOrder = orderedUserIds?.Where(userIdSet.Contains).ToArray() ?? userIds;

        return finalOrder
            .Select(userId =>
            {
                var user = usersById[userId];
                registrations.TryGetValue(userId, out var registration);

                return new AdminUserDto
                {
                    Id = user.Id,
                    RegistrationId = registration?.RegistrationId,
                    Email = TechnicalEmailHelper.ToVisibleEmail(user.Email),
                    DisplayName = user.DisplayName,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    Patronymic = user.Patronymic,
                    City = registration?.City ?? user.City,
                    ChurchName = registration?.ChurchName ?? user.ChurchName,
                    PhoneNumber = user.PhoneNumber,
                    Roles = rolesByUserId.GetValueOrDefault(user.Id, Array.Empty<string>()),
                    CreatedAtUtc = user.CreatedAtUtc,
                    LastLoginAtUtc = user.LastLoginAtUtc,
                    RegistrationEventEditionId = registration?.EventEditionId,
                    RegistrationEventSlug = registration?.EventSlug,
                    RegistrationEventTitle = registration?.EventTitle,
                    RegistrationStatus = registration?.Status,
                    RegistrationContactEmail = registration?.ContactEmail,
                    RegistrationFullName = registration?.FullName,
                    RegistrationBirthDate = registration?.BirthDate,
                    RegistrationPhoneNumber = registration?.PhoneNumber,
                    RegistrationPhoneNumberConfirmed = registration?.PhoneNumberConfirmed,
                    RegistrationSelectedPriceOptionId = registration?.SelectedPriceOptionId,
                    RegistrationSelectedPriceOptionTitle = registration?.SelectedPriceOptionTitle,
                    RegistrationSelectedPriceOptionAmount = registration?.SelectedPriceOptionAmount,
                    RegistrationSelectedPriceOptionCurrency = registration?.SelectedPriceOptionCurrency,
                    RegistrationParticipantsCount = registration?.ParticipantsCount,
                    RegistrationParticipants = registration?.Participants ?? Array.Empty<AdminRegistrationParticipantDto>(),
                    RegistrationHasCar = registration?.HasCar,
                    RegistrationHasChildren = registration?.HasChildren,
                    RegistrationEmergencyContactName = registration?.EmergencyContactName,
                    RegistrationEmergencyContactPhone = registration?.EmergencyContactPhone,
                    RegistrationAccommodationPreference = registration?.AccommodationPreference,
                    RegistrationHealthNotes = registration?.HealthNotes,
                    RegistrationAllergyNotes = registration?.AllergyNotes,
                    RegistrationSpecialNeeds = registration?.SpecialNeeds,
                    RegistrationMotivation = registration?.Motivation,
                    RegistrationConsentAccepted = registration?.ConsentAccepted,
                    RegistrationIsPaid = registration?.IsPaid,
                    RegistrationPaidAtUtc = registration?.PaidAtUtc,
                    RegistrationPaymentUpdatedBy = registration?.PaymentUpdatedByDisplayName,
                    RegistrationCreatedAtUtc = registration?.CreatedAtUtc,
                    RegistrationSubmittedAtUtc = registration?.SubmittedAtUtc,
                    RegistrationUpdatedAtUtc = registration?.UpdatedAtUtc,
                    RegistrationHistory = registration?.History ?? Array.Empty<AdminRegistrationHistoryEntryDto>(),
                    ExternalIdentities = externalIdentitiesByUserId.GetValueOrDefault(
                        user.Id,
                        Array.Empty<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>())
                };
            })
            .ToArray();
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<string>>> GetRolesByUserIdAsync(IReadOnlyCollection<Guid> userIds)
    {
        var roleRows = await (
            from userRole in _dbContext.UserRoles.AsNoTracking()
            join role in _dbContext.Roles.AsNoTracking() on userRole.RoleId equals role.Id
            where userIds.Contains(userRole.UserId) && role.Name != null
            select new { userRole.UserId, RoleName = role.Name! }
        ).ToListAsync();

        return roleRows
            .GroupBy(row => row.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<string>)group
                    .Select(row => row.RoleName)
                    .OrderBy(GetRoleSortOrder)
                    .ThenBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToArray());
    }

    private async Task<Dictionary<Guid, RegistrationListItem>> GetRegistrationsByUserIdAsync(IReadOnlyCollection<Guid> userIds, Guid? eventEditionId)
    {
        if (eventEditionId is null)
        {
            return [];
        }

        var registrations = await SelectRegistrationListItems(_dbContext.CampRegistrations
            .AsNoTracking()
            .Where(registration => userIds.Contains(registration.UserId) && registration.EventEditionId == eventEditionId))
            .ToListAsync();

        return registrations
            .GroupBy(registration => registration.UserId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(registration => registration.UpdatedAtUtc)
                    .ThenByDescending(registration => registration.CreatedAtUtc)
                    .First());
    }

    private static IQueryable<RegistrationListItem> SelectRegistrationListItems(IQueryable<CampRegistration> registrations)
    {
        return registrations.Select(registration => new RegistrationListItem
        {
            RegistrationId = registration.Id,
            UserId = registration.UserId,
            EventEditionId = registration.EventEditionId,
            EventSlug = registration.EventEdition != null ? registration.EventEdition.Slug : null,
            EventTitle = registration.EventEdition != null ? registration.EventEdition.Title : null,
            ContactEmail = registration.ContactEmail,
            FullName = registration.FullName,
            BirthDate = registration.BirthDate,
            PhoneNumber = registration.PhoneNumber,
            PhoneNumberConfirmed = registration.User.PhoneNumberConfirmed,
            City = registration.City,
            ChurchName = registration.ChurchName,
            SelectedPriceOptionId = registration.SelectedPriceOptionId,
            SelectedPriceOptionTitle = registration.SelectedPriceOption != null ? registration.SelectedPriceOption.Title : null,
            SelectedPriceOptionAmount = registration.SelectedPriceOption != null ? (decimal?)registration.SelectedPriceOption.Amount : null,
            SelectedPriceOptionCurrency = registration.SelectedPriceOption != null ? registration.SelectedPriceOption.Currency : null,
            ParticipantsCount = registration.ParticipantsCount,
            Participants = registration.Participants
                .OrderBy(participant => participant.SortOrder)
                .Select(participant => new AdminRegistrationParticipantDto
                {
                    FullName = participant.FullName,
                    BirthDate = participant.BirthDate,
                    IsChild = participant.IsChild,
                    SortOrder = participant.SortOrder
                })
                .ToArray(),
            HasCar = registration.HasCar,
            HasChildren = registration.HasChildren,
            EmergencyContactName = registration.EmergencyContactName,
            EmergencyContactPhone = registration.EmergencyContactPhone,
            AccommodationPreference = registration.AccommodationPreference,
            HealthNotes = registration.HealthNotes,
            AllergyNotes = registration.AllergyNotes,
            SpecialNeeds = registration.SpecialNeeds,
            Motivation = registration.Motivation,
            ConsentAccepted = registration.ConsentAccepted,
            IsPaid = registration.IsPaid,
            PaidAtUtc = registration.PaidAtUtc,
            PaymentUpdatedByDisplayName = registration.PaymentUpdatedByUser != null ? registration.PaymentUpdatedByUser.DisplayName : null,
            History = registration.HistoryEntries
                .OrderByDescending(history => history.CreatedAtUtc)
                .Take(20)
                .Select(history => new AdminRegistrationHistoryEntryDto
                {
                    ChangeType = history.ChangeType,
                    PreviousValue = history.PreviousValue,
                    NewValue = history.NewValue,
                    ActorDisplayName = history.ActorDisplayName,
                    CreatedAtUtc = history.CreatedAtUtc
                })
                .ToArray(),
            CreatedAtUtc = registration.CreatedAtUtc,
            SubmittedAtUtc = registration.SubmittedAtUtc,
            Status = registration.Status,
            UpdatedAtUtc = registration.UpdatedAtUtc
        });
    }

    private async Task<Dictionary<Guid, IReadOnlyCollection<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>>> GetExternalIdentitiesByUserIdAsync(IReadOnlyCollection<Guid> userIds)
    {
        var externalIdentities = await _dbContext.UserExternalIdentities
            .AsNoTracking()
            .Where(identity => userIds.Contains(identity.UserId))
            .OrderBy(identity => identity.Provider)
            .ToListAsync();

        return externalIdentities
            .GroupBy(identity => identity.UserId)
            .ToDictionary(
                group => group.Key,
                group => (IReadOnlyCollection<Blagodaty.Api.Contracts.Account.ExternalIdentityDto>)group
                    .Select(AccountMapper.ToExternalIdentity)
                    .ToArray());
    }

    private async Task AddRegistrationHistoryAsync(
        Guid registrationId,
        string changeType,
        string? previousValue,
        string? newValue,
        DateTime createdAtUtc,
        CancellationToken cancellationToken)
    {
        var actor = await _userManager.GetUserAsync(User);
        _dbContext.CampRegistrationHistoryEntries.Add(new CampRegistrationHistoryEntry
        {
            CampRegistrationId = registrationId,
            ActorUserId = actor?.Id,
            ActorDisplayName = actor?.DisplayName ?? User.Identity?.Name ?? "Администратор",
            ChangeType = changeType,
            PreviousValue = previousValue,
            NewValue = newValue,
            CreatedAtUtc = createdAtUtc
        });
    }

    private Guid? GetCurrentUserId()
    {
        var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var userId) ? userId : null;
    }

    private static string BuildDisplayName(string? firstName, string? lastName, string? fallback)
    {
        var parts = new[] { firstName?.Trim(), lastName?.Trim() }
            .Where(part => !string.IsNullOrWhiteSpace(part));
        var displayName = string.Join(' ', parts);
        return string.IsNullOrWhiteSpace(displayName) ? fallback ?? "Пользователь" : displayName;
    }

    private static AdminPagedResponse<AdminUserDto> CreatePagedResponse(
        int page,
        int pageSize,
        int totalItems,
        IReadOnlyCollection<AdminUserDto> items)
    {
        var totalPages = CalculateTotalPages(totalItems, pageSize);

        return new AdminPagedResponse<AdminUserDto>
        {
            Items = items,
            Page = Math.Min(NormalizePage(page), totalPages),
            PageSize = pageSize,
            TotalItems = totalItems,
            TotalPages = totalPages
        };
    }

    private static string? BuildSearchPattern(string? search)
    {
        var normalized = search?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : $"%{normalized}%";
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

    private sealed class RegistrationListItem
    {
        public required Guid RegistrationId { get; init; }
        public required Guid UserId { get; init; }
        public Guid? EventEditionId { get; init; }
        public string? EventSlug { get; init; }
        public string? EventTitle { get; init; }
        public string? ContactEmail { get; init; }
        public string? FullName { get; init; }
        public DateOnly BirthDate { get; init; }
        public string? PhoneNumber { get; init; }
        public bool PhoneNumberConfirmed { get; init; }
        public string? City { get; init; }
        public string? ChurchName { get; init; }
        public Guid? SelectedPriceOptionId { get; init; }
        public string? SelectedPriceOptionTitle { get; init; }
        public decimal? SelectedPriceOptionAmount { get; init; }
        public string? SelectedPriceOptionCurrency { get; init; }
        public int ParticipantsCount { get; init; }
        public required IReadOnlyCollection<AdminRegistrationParticipantDto> Participants { get; init; }
        public bool HasCar { get; init; }
        public bool HasChildren { get; init; }
        public string? EmergencyContactName { get; init; }
        public string? EmergencyContactPhone { get; init; }
        public AccommodationPreference AccommodationPreference { get; init; }
        public string? HealthNotes { get; init; }
        public string? AllergyNotes { get; init; }
        public string? SpecialNeeds { get; init; }
        public string? Motivation { get; init; }
        public bool ConsentAccepted { get; init; }
        public bool IsPaid { get; init; }
        public DateTime? PaidAtUtc { get; init; }
        public string? PaymentUpdatedByDisplayName { get; init; }
        public required IReadOnlyCollection<AdminRegistrationHistoryEntryDto> History { get; init; }
        public required DateTime CreatedAtUtc { get; init; }
        public DateTime? SubmittedAtUtc { get; init; }
        public required RegistrationStatus Status { get; init; }
        public required DateTime UpdatedAtUtc { get; init; }
    }

    private sealed class RegistrationStatsSummary
    {
        public required int TotalRegistrations { get; init; }
        public required int SubmittedRegistrations { get; init; }
        public required int ConfirmedRegistrations { get; init; }
    }
}
