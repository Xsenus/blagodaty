using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Blagodaty.Api.Security;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Services;

public sealed class EventRegistrationService
{
    private const string DefaultGuestCity = "Новосибирск";
    private const string DefaultGuestChurchName = "Благодать";
    private const int MinimumParticipantAge = 16;
    private const int AdultParticipantAge = 18;

    private readonly AppDbContext _dbContext;
    private readonly TimeProvider _timeProvider;
    private readonly EventCatalogService _eventCatalogService;
    private readonly UserNotificationService _userNotificationService;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly GoogleSheetsRegistrationSyncService _googleSheetsSyncService;

    public EventRegistrationService(
        AppDbContext dbContext,
        TimeProvider timeProvider,
        EventCatalogService eventCatalogService,
        UserNotificationService userNotificationService,
        UserManager<ApplicationUser> userManager,
        GoogleSheetsRegistrationSyncService googleSheetsSyncService)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
        _eventCatalogService = eventCatalogService;
        _userNotificationService = userNotificationService;
        _userManager = userManager;
        _googleSheetsSyncService = googleSheetsSyncService;
    }

    public async Task<EventEdition?> GetAccessibleEventEditionBySlugAsync(
        string slug,
        CancellationToken cancellationToken = default)
    {
        return await _dbContext.EventEditions
            .Include(item => item.EventSeries)
            .Include(item => item.PriceOptions)
            .FirstOrDefaultAsync(item =>
                item.Slug == slug &&
                item.EventSeries.IsActive &&
                item.Status != EventEditionStatus.Draft &&
                item.Status != EventEditionStatus.Archived, cancellationToken);
    }

    public async Task<CampRegistrationResponse?> GetRegistrationAsync(
        Guid userId,
        Guid eventEditionId,
        CancellationToken cancellationToken = default)
    {
        var registration = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
            .Include(item => item.Participants.OrderBy(participant => participant.SortOrder))
            .FirstOrDefaultAsync(
                item => item.UserId == userId && item.EventEditionId == eventEditionId,
                cancellationToken);

        return registration is null ? null : MapRegistration(registration);
    }

    public async Task<CampRegistrationResponse> UpsertRegistrationAsync(
        Guid userId,
        EventEdition eventEdition,
        UpsertCampRegistrationRequest request,
        bool allowLegacyDraftMigration,
        CancellationToken cancellationToken = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        EventPriceOption? selectedPriceOption = null;
        if (request.SelectedPriceOptionId is not null)
        {
            selectedPriceOption = eventEdition.PriceOptions
                .FirstOrDefault(option =>
                    option.Id == request.SelectedPriceOptionId.Value &&
                    option.IsActive &&
                    _eventCatalogService.IsPriceAvailable(option));

            if (selectedPriceOption is null)
            {
                throw new InvalidOperationException("Выбранный тариф не найден или уже недоступен для этого мероприятия.");
            }
        }

        var registration = await _dbContext.CampRegistrations
            .Include(item => item.Participants)
            .FirstOrDefaultAsync(
                item => item.UserId == userId && item.EventEditionId == eventEdition.Id,
                cancellationToken);

        if (registration is null && allowLegacyDraftMigration && eventEdition.EventSeries.Kind == EventKind.Camp)
        {
            registration = await _dbContext.CampRegistrations
                .Include(item => item.Participants)
                .FirstOrDefaultAsync(
                    item => item.UserId == userId && item.EventEditionId == null,
                    cancellationToken);
        }

        var normalizedParticipants = NormalizeParticipantsForRequest(request, requireAtLeastOneParticipant: request.Submit);
        var normalizedParticipantsCount = normalizedParticipants.Count;
        var existingOccupiedSeats = registration is not null && CountsAgainstCapacity(registration.Status)
            ? GetParticipantsCount(registration)
            : 0;
        var remainingCapacity = await _eventCatalogService.GetRemainingCapacityAsync(eventEdition.Id, cancellationToken);
        int? editableRemainingCapacity = remainingCapacity.HasValue
            ? remainingCapacity.Value + existingOccupiedSeats
            : null;

        if (request.Submit && !_eventCatalogService.IsRegistrationOpen(eventEdition, editableRemainingCapacity))
        {
            throw new InvalidOperationException("Регистрация на выбранное мероприятие сейчас закрыта или лимит мест уже достигнут.");
        }

        if (request.Submit &&
            !eventEdition.WaitlistEnabled &&
            editableRemainingCapacity.HasValue &&
            normalizedParticipantsCount > editableRemainingCapacity.Value)
        {
            throw new InvalidOperationException(
                $"Для этой заявки сейчас доступно только {editableRemainingCapacity.Value} мест, а вы указали {normalizedParticipantsCount}.");
        }

        if (registration is null)
        {
            registration = new CampRegistration
            {
                UserId = userId,
                CreatedAtUtc = now
            };

            _dbContext.CampRegistrations.Add(registration);
        }

        var user = await _dbContext.Users.FirstAsync(item => item.Id == userId, cancellationToken);
        var previousStatus = registration.Status;
        var normalizedContactEmail = request.ContactEmail.Trim();
        var normalizedCity = string.IsNullOrWhiteSpace(request.City)
            ? DefaultGuestCity
            : request.City.Trim();
        var normalizedChurchName = string.IsNullOrWhiteSpace(request.ChurchName)
            ? DefaultGuestChurchName
            : request.ChurchName.Trim();
        var normalizedEmergencyContactName = request.EmergencyContactName.Trim();
        var normalizedEmergencyContactPhone = request.EmergencyContactPhone.Trim();
        var normalizedPrimaryFullName = normalizedParticipants.FirstOrDefault()?.FullName ?? request.FullName.Trim();
        var parsedBirthDate = TryParseBirthDate(request.BirthDate);
        ApplyParticipantAgeRules(normalizedParticipants, parsedBirthDate, DateOnly.FromDateTime(eventEdition.StartsAtUtc));

        registration.EventEditionId = eventEdition.Id;
        registration.SelectedPriceOptionId = selectedPriceOption?.Id;
        var normalizedPhoneNumber = PhoneNumberHelper.Normalize(request.PhoneNumber);
        ValidateRequestForSubmission(
            request,
            eventEdition,
            selectedPriceOption,
            normalizedParticipants,
            normalizedContactEmail,
            parsedBirthDate,
            normalizedCity,
            normalizedChurchName,
            normalizedPhoneNumber,
            normalizedEmergencyContactName,
            normalizedEmergencyContactPhone);
        if (request.Submit && string.IsNullOrWhiteSpace(normalizedPhoneNumber))
        {
            throw new InvalidOperationException("Укажите корректный номер телефона участника.");
        }

        if (request.Submit &&
            (!string.Equals(user.PhoneNumber, normalizedPhoneNumber, StringComparison.Ordinal) || !user.PhoneNumberConfirmed))
        {
            throw new InvalidOperationException("Перед отправкой заявки подтвердите номер телефона этим же номером.");
        }

        registration.ContactEmail = normalizedContactEmail;
        registration.FullName = normalizedPrimaryFullName;
        registration.BirthDate = parsedBirthDate ?? default;
        registration.City = normalizedCity;
        registration.ChurchName = normalizedChurchName;
        registration.PhoneNumber = normalizedPhoneNumber ?? string.Empty;
        registration.HasCar = request.HasCar;
        registration.HasChildren = request.HasChildren || normalizedParticipants.Any(item => item.IsChild);
        registration.ParticipantsCount = normalizedParticipantsCount;
        registration.EmergencyContactName = normalizedEmergencyContactName;
        registration.EmergencyContactPhone = normalizedEmergencyContactPhone;
        registration.AccommodationPreference = request.AccommodationPreference;
        registration.HealthNotes = request.HealthNotes?.Trim();
        registration.AllergyNotes = request.AllergyNotes?.Trim();
        registration.SpecialNeeds = request.SpecialNeeds?.Trim();
        registration.Motivation = request.Motivation?.Trim();
        registration.ConsentAccepted = request.ConsentAccepted;
        registration.Status = request.Submit ? RegistrationStatus.Submitted : RegistrationStatus.Draft;
        registration.UpdatedAtUtc = now;
        registration.SubmittedAtUtc = request.Submit ? now : null;

        if (!string.IsNullOrWhiteSpace(registration.PhoneNumber) &&
            !string.Equals(user.PhoneNumber, registration.PhoneNumber, StringComparison.Ordinal))
        {
            user.PhoneNumberConfirmed = false;
        }

        if (!string.IsNullOrWhiteSpace(registration.PhoneNumber))
        {
            user.PhoneNumber = registration.PhoneNumber;
        }

        if (!string.IsNullOrWhiteSpace(registration.City))
        {
            user.City = registration.City;
        }

        if (!string.IsNullOrWhiteSpace(registration.ChurchName))
        {
            user.ChurchName = registration.ChurchName;
        }

        registration.Participants.Clear();
        foreach (var participant in normalizedParticipants)
        {
            registration.Participants.Add(new CampRegistrationParticipant
            {
                FullName = participant.FullName,
                PhoneNumber = participant.PhoneNumber,
                BirthDate = participant.BirthDate,
                IsChild = participant.IsChild,
                SortOrder = participant.SortOrder
            });
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        var saved = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
            .Include(item => item.Participants.OrderBy(participant => participant.SortOrder))
            .FirstAsync(item => item.Id == registration.Id, cancellationToken);

        if (request.Submit && previousStatus != RegistrationStatus.Submitted)
        {
            await _userNotificationService.NotifyRegistrationSubmittedAsync(saved, cancellationToken);
        }

        if (request.Submit || saved.Status != RegistrationStatus.Draft)
        {
            await _googleSheetsSyncService.TrySyncRegistrationEventAsync(saved.EventEditionId, cancellationToken);
        }

        return MapRegistration(saved);
    }

    public async Task<CampRegistrationResponse> SubmitGuestRegistrationAsync(
        EventEdition eventEdition,
        UpsertCampRegistrationRequest request,
        CancellationToken cancellationToken = default)
    {
        request.Submit = true;

        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var normalizedParticipants = NormalizeParticipantsForRequest(request, requireAtLeastOneParticipant: true);
        var normalizedParticipantsCount = normalizedParticipants.Count;
        var remainingCapacity = await _eventCatalogService.GetRemainingCapacityAsync(eventEdition.Id, cancellationToken);

        EventPriceOption? selectedPriceOption = null;
        if (request.SelectedPriceOptionId is not null)
        {
            selectedPriceOption = eventEdition.PriceOptions
                .FirstOrDefault(option =>
                    option.Id == request.SelectedPriceOptionId.Value &&
                    option.IsActive &&
                    _eventCatalogService.IsPriceAvailable(option));

            if (selectedPriceOption is null)
            {
                throw new InvalidOperationException("Выбранный тариф не найден или уже недоступен для этого мероприятия.");
            }
        }

        if (!_eventCatalogService.IsRegistrationOpen(eventEdition, remainingCapacity))
        {
            throw new InvalidOperationException("Регистрация на выбранное мероприятие сейчас закрыта или лимит мест уже достигнут.");
        }

        if (!eventEdition.WaitlistEnabled &&
            remainingCapacity.HasValue &&
            normalizedParticipantsCount > remainingCapacity.Value)
        {
            throw new InvalidOperationException(
                $"Для этой заявки сейчас доступно только {remainingCapacity.Value} мест, а вы указали {normalizedParticipantsCount}.");
        }

        var normalizedContactEmail = request.ContactEmail.Trim();
        var normalizedCity = string.IsNullOrWhiteSpace(request.City)
            ? DefaultGuestCity
            : request.City.Trim();
        var normalizedChurchName = string.IsNullOrWhiteSpace(request.ChurchName)
            ? DefaultGuestChurchName
            : request.ChurchName.Trim();
        var normalizedEmergencyContactName = request.EmergencyContactName.Trim();
        var normalizedEmergencyContactPhone = request.EmergencyContactPhone.Trim();
        var normalizedPrimaryFullName = normalizedParticipants.First().FullName;
        var parsedBirthDate = TryParseBirthDate(request.BirthDate);
        ApplyParticipantAgeRules(normalizedParticipants, parsedBirthDate, DateOnly.FromDateTime(eventEdition.StartsAtUtc));
        var normalizedPhoneNumber = PhoneNumberHelper.Normalize(request.PhoneNumber);

        ValidateRequestForSubmission(
            request,
            eventEdition,
            selectedPriceOption,
            normalizedParticipants,
            normalizedContactEmail,
            parsedBirthDate,
            normalizedCity,
            normalizedChurchName,
            normalizedPhoneNumber,
            normalizedEmergencyContactName,
            normalizedEmergencyContactPhone);

        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
        var guestUser = BuildGuestUser(
            normalizedPrimaryFullName,
            normalizedPhoneNumber,
            normalizedCity,
            normalizedChurchName,
            now);
        var createResult = await _userManager.CreateAsync(guestUser);
        if (!createResult.Succeeded)
        {
            var message = string.Join(" ", createResult.Errors.Select(error => error.Description));
            throw new InvalidOperationException($"Не удалось сохранить гостевую заявку. {message}");
        }

        if (await _dbContext.Roles.AnyAsync(role => role.Name == AppRoles.Member, cancellationToken))
        {
            var roleResult = await _userManager.AddToRoleAsync(guestUser, AppRoles.Member);
            if (!roleResult.Succeeded)
            {
                var message = string.Join(" ", roleResult.Errors.Select(error => error.Description));
                throw new InvalidOperationException($"Не удалось сохранить роль гостевой заявки. {message}");
            }
        }

        var registration = new CampRegistration
        {
            UserId = guestUser.Id,
            EventEditionId = eventEdition.Id,
            SelectedPriceOptionId = selectedPriceOption?.Id,
            Status = RegistrationStatus.Submitted,
            ContactEmail = normalizedContactEmail,
            FullName = normalizedPrimaryFullName,
            BirthDate = parsedBirthDate ?? default,
            City = normalizedCity,
            ChurchName = normalizedChurchName,
            PhoneNumber = normalizedPhoneNumber ?? string.Empty,
            HasCar = request.HasCar,
            HasChildren = request.HasChildren || normalizedParticipants.Any(item => item.IsChild),
            ParticipantsCount = normalizedParticipantsCount,
            EmergencyContactName = normalizedEmergencyContactName,
            EmergencyContactPhone = PhoneNumberHelper.Normalize(normalizedEmergencyContactPhone) ?? normalizedEmergencyContactPhone,
            AccommodationPreference = request.AccommodationPreference,
            HealthNotes = request.HealthNotes?.Trim(),
            AllergyNotes = request.AllergyNotes?.Trim(),
            SpecialNeeds = request.SpecialNeeds?.Trim(),
            Motivation = request.Motivation?.Trim(),
            ConsentAccepted = request.ConsentAccepted,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            SubmittedAtUtc = now
        };

        foreach (var participant in normalizedParticipants)
        {
            registration.Participants.Add(new CampRegistrationParticipant
            {
                FullName = participant.FullName,
                PhoneNumber = participant.PhoneNumber,
                BirthDate = participant.BirthDate,
                IsChild = participant.IsChild,
                SortOrder = participant.SortOrder
            });
        }

        _dbContext.CampRegistrations.Add(registration);
        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var saved = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.User)
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
            .Include(item => item.Participants.OrderBy(participant => participant.SortOrder))
            .FirstAsync(item => item.Id == registration.Id, cancellationToken);

        await _userNotificationService.NotifyRegistrationSubmittedAsync(saved, cancellationToken);
        await _googleSheetsSyncService.TrySyncRegistrationEventAsync(saved.EventEditionId, cancellationToken);

        return MapRegistration(saved);
    }

    public async Task<IReadOnlyCollection<AccountRegistrationSummaryDto>> GetUserRegistrationsAsync(
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var registrations = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
            .Where(item => item.UserId == userId && item.EventEditionId != null)
            .OrderByDescending(item => item.EventEdition!.StartsAtUtc)
            .ThenByDescending(item => item.UpdatedAtUtc)
            .ToListAsync(cancellationToken);

        if (registrations.Count == 0)
        {
            return Array.Empty<AccountRegistrationSummaryDto>();
        }

        var eventEditionIds = registrations
            .Select(item => item.EventEditionId!.Value)
            .Distinct()
            .ToArray();

        var occupancyByEditionId = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Where(item =>
                item.EventEditionId != null &&
                eventEditionIds.Contains(item.EventEditionId.Value) &&
                item.Status != RegistrationStatus.Draft &&
                item.Status != RegistrationStatus.Cancelled)
            .GroupBy(item => item.EventEditionId!.Value)
            .Select(group => new
            {
                EventEditionId = group.Key,
                Count = group.Sum(item => item.ParticipantsCount)
            })
            .ToListAsync(cancellationToken);

        var occupancyLookup = occupancyByEditionId.ToDictionary(item => item.EventEditionId, item => item.Count);

        return registrations
            .Select(registration =>
            {
                var eventEdition = registration.EventEdition!;
                int? remainingCapacity = eventEdition.Capacity.HasValue
                    ? Math.Max(
                        eventEdition.Capacity.Value - occupancyLookup.GetValueOrDefault(registration.EventEditionId!.Value, 0),
                        0)
                    : null;

                return new AccountRegistrationSummaryDto
                {
                    Id = registration.Id,
                    EventEditionId = registration.EventEditionId,
                    EventSlug = eventEdition.Slug,
                    EventTitle = eventEdition.Title,
                    EventSeasonLabel = eventEdition.SeasonLabel,
                    EventSeriesTitle = eventEdition.EventSeries.Title,
                    EventLocation = eventEdition.Location,
                    EventStartsAtUtc = eventEdition.StartsAtUtc,
                    EventEndsAtUtc = eventEdition.EndsAtUtc,
                    RegistrationOpensAtUtc = eventEdition.RegistrationOpensAtUtc,
                    RegistrationClosesAtUtc = eventEdition.RegistrationClosesAtUtc,
                    IsRegistrationOpen = _eventCatalogService.IsRegistrationOpen(eventEdition, remainingCapacity),
                    IsRegistrationClosingSoon = _eventCatalogService.IsRegistrationClosingSoon(eventEdition, remainingCapacity),
                    RemainingCapacity = remainingCapacity,
                    SelectedPriceOptionId = registration.SelectedPriceOptionId,
                    SelectedPriceOptionTitle = registration.SelectedPriceOption?.Title,
                    SelectedPriceOptionAmount = registration.SelectedPriceOption?.Amount,
                    SelectedPriceOptionCurrency = registration.SelectedPriceOption?.Currency,
                    ParticipantsCount = GetParticipantsCount(registration),
                    Status = registration.Status,
                    CreatedAtUtc = registration.CreatedAtUtc,
                    UpdatedAtUtc = registration.UpdatedAtUtc,
                    SubmittedAtUtc = registration.SubmittedAtUtc
                };
            })
            .ToArray();
    }

    public static CampRegistrationResponse MapRegistration(CampRegistration registration)
    {
        var participants = BuildParticipantDtos(registration);

        return new CampRegistrationResponse
        {
            Id = registration.Id,
            EventEditionId = registration.EventEditionId,
            EventSlug = registration.EventEdition?.Slug,
            EventTitle = registration.EventEdition?.Title,
            EventSeasonLabel = registration.EventEdition?.SeasonLabel,
            EventSeriesTitle = registration.EventEdition?.EventSeries.Title,
            EventLocation = registration.EventEdition?.Location,
            SelectedPriceOptionId = registration.SelectedPriceOptionId,
            SelectedPriceOptionTitle = registration.SelectedPriceOption?.Title,
            SelectedPriceOptionAmount = registration.SelectedPriceOption?.Amount,
            SelectedPriceOptionCurrency = registration.SelectedPriceOption?.Currency,
            Status = registration.Status,
            ContactEmail = !string.IsNullOrWhiteSpace(registration.ContactEmail)
                ? registration.ContactEmail
                : TechnicalEmailHelper.ToVisibleEmail(registration.User?.Email),
            FullName = registration.FullName,
            BirthDate = registration.BirthDate == default ? string.Empty : registration.BirthDate.ToString("yyyy-MM-dd"),
            City = registration.City,
            ChurchName = registration.ChurchName,
            PhoneNumber = registration.PhoneNumber,
            PhoneNumberConfirmed = registration.User?.PhoneNumberConfirmed ?? false,
            HasCar = registration.HasCar,
            HasChildren = registration.HasChildren || participants.Any(item => item.IsChild),
            ParticipantsCount = participants.Count,
            Participants = participants,
            EmergencyContactName = registration.EmergencyContactName,
            EmergencyContactPhone = registration.EmergencyContactPhone,
            AccommodationPreference = registration.AccommodationPreference,
            HealthNotes = registration.HealthNotes,
            AllergyNotes = registration.AllergyNotes,
            SpecialNeeds = registration.SpecialNeeds,
            Motivation = registration.Motivation,
            ConsentAccepted = registration.ConsentAccepted,
            CreatedAtUtc = registration.CreatedAtUtc,
            UpdatedAtUtc = registration.UpdatedAtUtc,
            SubmittedAtUtc = registration.SubmittedAtUtc
        };
    }

    public static int GetParticipantsCount(CampRegistration registration)
    {
        if (registration.ParticipantsCount > 0)
        {
            return registration.ParticipantsCount;
        }

        if (registration.Participants.Count > 0)
        {
            return registration.Participants.Count;
        }

        return string.IsNullOrWhiteSpace(registration.FullName) ? 0 : 1;
    }

    public static bool CountsAgainstCapacity(RegistrationStatus status)
    {
        return status != RegistrationStatus.Draft && status != RegistrationStatus.Cancelled;
    }

    private static List<CampRegistrationParticipantDto> BuildParticipantDtos(CampRegistration registration)
    {
        if (registration.Participants.Count > 0)
        {
            return registration.Participants
                .OrderBy(item => item.SortOrder)
                .ThenBy(item => item.FullName)
                .Select(item => new CampRegistrationParticipantDto
                {
                    Id = item.Id,
                    FullName = item.FullName,
                    PhoneNumber = item.PhoneNumber,
                    BirthDate = item.BirthDate?.ToString("yyyy-MM-dd"),
                    IsChild = item.IsChild,
                    SortOrder = item.SortOrder
                })
                .ToList();
        }

        return
        [
            new CampRegistrationParticipantDto
            {
                Id = registration.Id,
                FullName = registration.FullName,
                PhoneNumber = registration.PhoneNumber,
                BirthDate = registration.BirthDate == default ? null : registration.BirthDate.ToString("yyyy-MM-dd"),
                IsChild = registration.HasChildren,
                SortOrder = 0
            }
        ];
    }

    private static List<NormalizedParticipant> NormalizeParticipants(
        UpsertCampRegistrationRequest request,
        bool requireAtLeastOneParticipant)
    {
        var sourceParticipants = request.Participants
            .Select((participant, index) => new NormalizedParticipant
            {
                FullName = participant.FullName.Trim(),
                PhoneNumber = NormalizeParticipantPhoneNumber(participant.PhoneNumber, index == 0 ? request.PhoneNumber : null),
                BirthDate = TryParseBirthDate(participant.BirthDate),
                IsChild = participant.IsChild,
                SortOrder = index
            })
            .Where(participant => !string.IsNullOrWhiteSpace(participant.FullName))
            .ToList();

        if (sourceParticipants.Count > 0)
        {
            return sourceParticipants;
        }

        var primaryFullName = request.FullName.Trim();
        if (string.IsNullOrWhiteSpace(primaryFullName))
        {
            throw new InvalidOperationException("Укажите хотя бы одного участника для заявки.");
        }

        return
        [
            new NormalizedParticipant
            {
                FullName = primaryFullName,
                PhoneNumber = PhoneNumberHelper.Normalize(request.PhoneNumber) ?? (request.PhoneNumber ?? string.Empty).Trim(),
                BirthDate = TryParseBirthDate(request.BirthDate),
                IsChild = false,
                SortOrder = 0
            }
        ];
    }

    private static List<NormalizedParticipant> NormalizeParticipantsForRequest(
        UpsertCampRegistrationRequest request,
        bool requireAtLeastOneParticipant)
    {
        var sourceParticipants = request.Participants
            .Select((participant, index) => new NormalizedParticipant
            {
                FullName = participant.FullName.Trim(),
                PhoneNumber = NormalizeParticipantPhoneNumber(participant.PhoneNumber, index == 0 ? request.PhoneNumber : null),
                BirthDate = TryParseBirthDate(participant.BirthDate),
                IsChild = participant.IsChild,
                SortOrder = index
            })
            .Where(participant => !string.IsNullOrWhiteSpace(participant.FullName))
            .ToList();

        if (sourceParticipants.Count > 0)
        {
            return sourceParticipants;
        }

        var primaryFullName = request.FullName.Trim();
        if (string.IsNullOrWhiteSpace(primaryFullName))
        {
            if (!requireAtLeastOneParticipant)
            {
                return [];
            }

            throw new InvalidOperationException("Укажите хотя бы одного участника для заявки.");
        }

        return
        [
            new NormalizedParticipant
            {
                FullName = primaryFullName,
                PhoneNumber = PhoneNumberHelper.Normalize(request.PhoneNumber) ?? (request.PhoneNumber ?? string.Empty).Trim(),
                BirthDate = TryParseBirthDate(request.BirthDate),
                IsChild = false,
                SortOrder = 0
            }
        ];
    }

    private static DateOnly? TryParseBirthDate(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateOnly.TryParse(value.Trim(), out var birthDate) ? birthDate : null;
    }

    private static string NormalizeParticipantPhoneNumber(string? phoneNumber, string? fallbackPhoneNumber)
    {
        var source = string.IsNullOrWhiteSpace(phoneNumber) ? fallbackPhoneNumber : phoneNumber;
        return PhoneNumberHelper.Normalize(source) ?? (source ?? string.Empty).Trim();
    }

    private static void ValidateRequestForSubmission(
        UpsertCampRegistrationRequest request,
        EventEdition eventEdition,
        EventPriceOption? selectedPriceOption,
        IReadOnlyCollection<NormalizedParticipant> normalizedParticipants,
        string normalizedContactEmail,
        DateOnly? parsedBirthDate,
        string normalizedCity,
        string normalizedChurchName,
        string? normalizedPhoneNumber,
        string normalizedEmergencyContactName,
        string normalizedEmergencyContactPhone)
    {
        if (!request.Submit)
        {
            return;
        }

        var errors = new List<string>();
        var hasActivePriceOptions = eventEdition.PriceOptions.Any(option => option.IsActive);
        var emailValidator = new EmailAddressAttribute();

        if (hasActivePriceOptions && selectedPriceOption is null)
        {
            errors.Add("Выберите тариф участия.");
        }

        if (string.IsNullOrWhiteSpace(normalizedContactEmail))
        {
            errors.Add("Укажите email для связи.");
        }
        else if (!emailValidator.IsValid(normalizedContactEmail))
        {
            errors.Add("Проверьте формат email.");
        }

        if (normalizedParticipants.Count == 0)
        {
            errors.Add("Укажите хотя бы одного участника.");
        }

        var eventStartsAt = DateOnly.FromDateTime(eventEdition.StartsAtUtc);

        if (parsedBirthDate is null)
        {
            errors.Add("Укажите дату рождения основного участника.");
        }
        else if (!IsMinimumAgeReached(parsedBirthDate.Value, eventStartsAt))
        {
            errors.Add($"К участию допускаются участники с {MinimumParticipantAge} лет на дату начала похода.");
        }

        foreach (var participant in normalizedParticipants)
        {
            if (participant.SortOrder == 0 && participant.BirthDate is null)
            {
                errors.Add($"Укажите дату рождения участника: {participant.FullName}.");
                continue;
            }

            if (participant.BirthDate.HasValue && !IsMinimumAgeReached(participant.BirthDate.Value, eventStartsAt))
            {
                errors.Add($"Участнику {participant.FullName} должно быть не меньше {MinimumParticipantAge} лет на дату начала похода.");
            }
        }

        var hasMinorParticipant = normalizedParticipants.Any(participant =>
            participant.BirthDate.HasValue && IsMinorParticipant(participant.BirthDate.Value, eventStartsAt));
        var primaryIsAdult = parsedBirthDate.HasValue && CalculateAge(parsedBirthDate.Value, eventStartsAt) >= AdultParticipantAge;
        if (hasMinorParticipant && !primaryIsAdult)
        {
            errors.Add("Участника 16-17 лет может зарегистрировать только взрослый родитель или сопровождающий. Добавьте взрослого основным участником.");
        }

        if (normalizedParticipants.Count > 1 && !primaryIsAdult)
        {
            errors.Add("Добавить участника может только взрослый основной участник.");
        }

        if (string.IsNullOrWhiteSpace(normalizedPhoneNumber))
        {
            errors.Add("Укажите корректный телефон участника.");
        }

        foreach (var participant in normalizedParticipants.Where(item => item.SortOrder > 0))
        {
            if (string.IsNullOrWhiteSpace(participant.PhoneNumber))
            {
                errors.Add($"Укажите телефон участника: {participant.FullName}.");
            }
            else if (string.IsNullOrWhiteSpace(PhoneNumberHelper.Normalize(participant.PhoneNumber)))
            {
                errors.Add($"Проверьте телефон участника: {participant.FullName}.");
            }
        }

        if (!string.IsNullOrWhiteSpace(normalizedEmergencyContactPhone) &&
            string.IsNullOrWhiteSpace(PhoneNumberHelper.Normalize(normalizedEmergencyContactPhone)))
        {
            errors.Add("Укажите корректный телефон доверенного лица.");
        }

        if (!request.ConsentAccepted)
        {
            errors.Add("Подтвердите согласие на обработку персональных данных.");
        }

        if (request.AccommodationPreference == AccommodationPreference.Cabin)
        {
            errors.Add("Размещение в этом походе палаточное; выберите палатку или дополнительные условия.");
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(" ", errors));
        }
    }

    private static ApplicationUser BuildGuestUser(
        string fullName,
        string? normalizedPhoneNumber,
        string? city,
        string? churchName,
        DateTime createdAtUtc)
    {
        var displayName = string.IsNullOrWhiteSpace(fullName) ? "Гость" : fullName.Trim();
        var parts = displayName.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var firstName = parts.FirstOrDefault() ?? displayName;
        var lastName = parts.Length > 1 ? string.Join(' ', parts.Skip(1)) : string.Empty;
        var technicalEmail = $"guest-{Guid.NewGuid():N}@guest.blagodaty.local";

        return new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = technicalEmail,
            Email = technicalEmail,
            FirstName = firstName,
            LastName = lastName,
            DisplayName = displayName,
            City = string.IsNullOrWhiteSpace(city) ? null : city.Trim(),
            ChurchName = string.IsNullOrWhiteSpace(churchName) ? null : churchName.Trim(),
            PhoneNumber = normalizedPhoneNumber,
            PhoneNumberConfirmed = false,
            EmailConfirmed = false,
            CreatedAtUtc = createdAtUtc
        };
    }

    private static void ApplyParticipantAgeRules(
        IReadOnlyList<NormalizedParticipant> participants,
        DateOnly? primaryBirthDate,
        DateOnly eventStartsAt)
    {
        if (participants.Count == 0)
        {
            return;
        }

        if (participants[0].BirthDate is null && primaryBirthDate.HasValue)
        {
            participants[0].BirthDate = primaryBirthDate;
        }

        foreach (var participant in participants)
        {
            if (participant.BirthDate.HasValue)
            {
                participant.IsChild = IsMinorParticipant(participant.BirthDate.Value, eventStartsAt);
            }
        }
    }

    private static bool IsMinimumAgeReached(DateOnly birthDate, DateOnly eventStartsAt)
    {
        return CalculateAge(birthDate, eventStartsAt) >= MinimumParticipantAge;
    }

    private static bool IsMinorParticipant(DateOnly birthDate, DateOnly eventStartsAt)
    {
        var age = CalculateAge(birthDate, eventStartsAt);
        return age >= MinimumParticipantAge && age < AdultParticipantAge;
    }

    private static int CalculateAge(DateOnly birthDate, DateOnly eventStartsAt)
    {
        var age = eventStartsAt.Year - birthDate.Year;
        if (eventStartsAt.Month < birthDate.Month ||
            (eventStartsAt.Month == birthDate.Month && eventStartsAt.Day < birthDate.Day))
        {
            age--;
        }

        return age;
    }

    private sealed class NormalizedParticipant
    {
        public required string FullName { get; init; }
        public required string PhoneNumber { get; init; }
        public DateOnly? BirthDate { get; set; }
        public required bool IsChild { get; set; }
        public required int SortOrder { get; init; }
    }
}
