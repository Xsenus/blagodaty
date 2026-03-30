using Blagodaty.Api.Contracts.Account;
using Blagodaty.Api.Contracts.Camp;
using Blagodaty.Api.Data;
using Blagodaty.Api.Models;
using Microsoft.EntityFrameworkCore;

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
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
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
        var remainingCapacity = await _eventCatalogService.GetRemainingCapacityAsync(eventEdition.Id, cancellationToken);
        if (request.Submit && !_eventCatalogService.IsRegistrationOpen(eventEdition, remainingCapacity))
        {
            throw new InvalidOperationException("Регистрация на выбранное мероприятие сейчас закрыта или лимит мест уже достигнут.");
        }

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
            .FirstOrDefaultAsync(
                item => item.UserId == userId && item.EventEditionId == eventEdition.Id,
                cancellationToken);

        if (registration is null && allowLegacyDraftMigration && eventEdition.EventSeries.Kind == EventKind.Camp)
        {
            registration = await _dbContext.CampRegistrations
                .FirstOrDefaultAsync(
                    item => item.UserId == userId && item.EventEditionId == null,
                    cancellationToken);
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

        var previousStatus = registration.Status;
        registration.EventEditionId = eventEdition.Id;
        registration.SelectedPriceOptionId = selectedPriceOption?.Id;
        registration.FullName = request.FullName.Trim();
        registration.BirthDate = request.BirthDate;
        registration.City = request.City.Trim();
        registration.ChurchName = request.ChurchName.Trim();
        registration.PhoneNumber = request.PhoneNumber.Trim();
        registration.EmergencyContactName = request.EmergencyContactName.Trim();
        registration.EmergencyContactPhone = request.EmergencyContactPhone.Trim();
        registration.AccommodationPreference = request.AccommodationPreference;
        registration.HealthNotes = request.HealthNotes?.Trim();
        registration.AllergyNotes = request.AllergyNotes?.Trim();
        registration.SpecialNeeds = request.SpecialNeeds?.Trim();
        registration.Motivation = request.Motivation?.Trim();
        registration.ConsentAccepted = request.ConsentAccepted;
        registration.Status = request.Submit ? RegistrationStatus.Submitted : RegistrationStatus.Draft;
        registration.UpdatedAtUtc = now;
        registration.SubmittedAtUtc = request.Submit ? now : null;

        await _dbContext.SaveChangesAsync(cancellationToken);

        var saved = await _dbContext.CampRegistrations
            .AsNoTracking()
            .Include(item => item.EventEdition)
            .ThenInclude(item => item!.EventSeries)
            .Include(item => item.SelectedPriceOption)
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
                Count = group.Count()
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
            FullName = registration.FullName,
            BirthDate = registration.BirthDate,
            City = registration.City,
            ChurchName = registration.ChurchName,
            PhoneNumber = registration.PhoneNumber,
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
}
