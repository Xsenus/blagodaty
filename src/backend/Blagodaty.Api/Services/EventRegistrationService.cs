using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace Blagodaty.Api.Services;

public sealed class EventRegistrationService
{
    private readonly AppDbContext _dbContext;
    private readonly TimeProvider _timeProvider;
    private readonly EventCatalogService _eventCatalogService;
    private readonly UserNotificationService _userNotificationService;

    public EventRegistrationService(
        AppDbContext dbContext,
        TimeProvider timeProvider,
        EventCatalogService eventCatalogService,
        UserNotificationService userNotificationService)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
        _eventCatalogService = eventCatalogService;
        _userNotificationService = userNotificationService;
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
        var normalizedCity = request.City.Trim();
        var normalizedChurchName = request.ChurchName.Trim();
        var normalizedEmergencyContactName = request.EmergencyContactName.Trim();
        var normalizedEmergencyContactPhone = request.EmergencyContactPhone.Trim();
        var normalizedPrimaryFullName = normalizedParticipants.FirstOrDefault()?.FullName ?? request.FullName.Trim();
        var parsedBirthDate = TryParseBirthDate(request.BirthDate);

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

        if (parsedBirthDate is null)
        {
            errors.Add("Укажите дату рождения основного участника.");
        }

        if (string.IsNullOrWhiteSpace(normalizedCity))
        {
            errors.Add("Укажите город.");
        }

        if (string.IsNullOrWhiteSpace(normalizedChurchName))
        {
            errors.Add("Укажите церковь.");
        }

        if (string.IsNullOrWhiteSpace(normalizedPhoneNumber))
        {
            errors.Add("Укажите корректный телефон участника.");
        }

        if (string.IsNullOrWhiteSpace(normalizedEmergencyContactName))
        {
            errors.Add("Укажите доверенное лицо для экстренной связи.");
        }

        if (string.IsNullOrWhiteSpace(PhoneNumberHelper.Normalize(normalizedEmergencyContactPhone)))
        {
            errors.Add("Укажите корректный телефон доверенного лица.");
        }

        if (!request.ConsentAccepted)
        {
            errors.Add("Подтвердите согласие на обработку персональных данных.");
        }

        if (errors.Count > 0)
        {
            throw new InvalidOperationException(string.Join(" ", errors));
        }
    }

    private sealed class NormalizedParticipant
    {
        public required string FullName { get; init; }
        public required bool IsChild { get; init; }
        public required int SortOrder { get; init; }
    }
}
