import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { ApiError, getPublicEvent, getPublicEvents, saveEventRegistration } from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import { normalizePhone, PhoneVerificationPanel } from '../ui/PhoneVerificationPanel';
import type {
  AccommodationPreference,
  CampRegistration,
  CurrentAccount,
  ExternalIdentity,
  PublicEventDetails,
  PublicEventSummary,
  SaveRegistrationRequest,
} from '../types';

type EditableParticipant = {
  fullName: string;
  isChild: boolean;
};

const EMPTY_PARTICIPANT: EditableParticipant = {
  fullName: '',
  isChild: false,
};

function createEmptyForm(): SaveRegistrationRequest {
  return {
    selectedPriceOptionId: null,
    contactEmail: '',
    fullName: '',
    birthDate: '',
    city: '',
    churchName: '',
    phoneNumber: '',
    hasCar: false,
    hasChildren: false,
    participants: [{ ...EMPTY_PARTICIPANT }],
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Either',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: false,
  };
}

function isPriceOptionCurrentlyAvailable(
  option: {
    isActive: boolean;
    salesStartsAtUtc?: string | null;
    salesEndsAtUtc?: string | null;
  },
) {
  if (!option.isActive) {
    return false;
  }

  const now = Date.now();
  const startsAt = option.salesStartsAtUtc ? new Date(option.salesStartsAtUtc).getTime() : null;
  const endsAt = option.salesEndsAtUtc ? new Date(option.salesEndsAtUtc).getTime() : null;

  return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
}

function pickPreferredEventSlug(
  events: PublicEventSummary[],
  registrations: CurrentAccount['registrations'],
  requestedSlug?: string | null,
) {
  if (requestedSlug && events.some((eventItem) => eventItem.slug === requestedSlug)) {
    return requestedSlug;
  }

  const existingRegistrationSlug = registrations.find((item) => item.eventSlug)?.eventSlug;
  if (existingRegistrationSlug && events.some((eventItem) => eventItem.slug === existingRegistrationSlug)) {
    return existingRegistrationSlug;
  }

  return events.find((eventItem) => eventItem.isRegistrationOpen)?.slug ?? events[0]?.slug ?? null;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Уточняется';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDateRangeCompact(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return 'Даты уточняются';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  });
  const startsAt = new Date(startsAtUtc);

  if (!endsAtUtc) {
    return formatter.format(startsAt);
  }

  const endsAt = new Date(endsAtUtc);
  return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
}

function formatMoney(amount?: number | null, currency = 'RUB') {
  if (amount == null) {
    return 'Уточняется';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatTimeOnly(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  return /^\+\d{10,15}$/.test(normalizePhone(value));
}

function formatStatus(status?: CampRegistration['status'] | null) {
  switch (status) {
    case 'Submitted':
      return 'Отправлено';
    case 'Confirmed':
      return 'Подтверждено';
    case 'Cancelled':
      return 'Отменено';
    case 'Draft':
      return 'Черновик';
    default:
      return 'Новая заявка';
  }
}

function formatProviderLabel(identity: ExternalIdentity) {
  switch (identity.provider) {
    case 'google':
      return 'Google';
    case 'vk':
      return 'VK';
    case 'yandex':
      return 'Yandex';
    case 'telegram':
      return 'Telegram';
    default:
      return identity.displayName;
  }
}

function getPreferredName(account: CurrentAccount | null) {
  if (!account) {
    return '';
  }

  const fromProfile = `${account.user.firstName} ${account.user.lastName}`.trim();
  if (fromProfile) {
    return fromProfile;
  }

  if (account.user.displayName.trim()) {
    return account.user.displayName.trim();
  }

  return account.externalIdentities
    .map((identity) => identity.displayName?.trim())
    .find((value) => Boolean(value)) ?? '';
}

function getPreferredEmail(account: CurrentAccount | null) {
  if (!account) {
    return '';
  }

  if (account.user.email.trim()) {
    return account.user.email.trim();
  }

  const verifiedProviderEmail = account.externalIdentities
    .find((identity) => identity.providerEmailVerified && identity.providerEmail?.trim());
  if (verifiedProviderEmail?.providerEmail) {
    return verifiedProviderEmail.providerEmail.trim();
  }

  return account.externalIdentities
    .find((identity) => identity.providerEmail?.trim())
    ?.providerEmail?.trim() ?? '';
}

function getIdentitySource(account: CurrentAccount | null, email: string) {
  if (!account || !email) {
    return '';
  }

  const match = account.externalIdentities.find((identity) => identity.providerEmail?.trim() === email);
  return match ? formatProviderLabel(match) : '';
}

function ensureParticipants(participants: EditableParticipant[], fallbackFullName = '') {
  const sanitized = participants.map((participant) => ({
    fullName: participant.fullName,
    isChild: participant.isChild,
  }));

  if (sanitized.length > 0) {
    return sanitized;
  }

  return [
    {
      fullName: fallbackFullName,
      isChild: false,
    },
  ];
}

function syncParticipants(current: SaveRegistrationRequest, participants: EditableParticipant[]) {
  const nextParticipants = ensureParticipants(participants, current.fullName);
  return {
    ...current,
    participants: nextParticipants,
    fullName: nextParticipants[0]?.fullName ?? '',
    hasChildren: current.hasChildren || nextParticipants.some((participant) => participant.isChild),
  };
}

function registrationToForm(currentRegistration: CampRegistration): SaveRegistrationRequest {
  const participants = currentRegistration.participants.length > 0
    ? currentRegistration.participants
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((participant) => ({
          fullName: participant.fullName,
          isChild: participant.isChild,
        }))
    : [
        {
          fullName: currentRegistration.fullName,
          isChild: currentRegistration.hasChildren,
        },
      ];

  return {
    selectedPriceOptionId: currentRegistration.selectedPriceOptionId ?? null,
    contactEmail: currentRegistration.contactEmail,
    fullName: currentRegistration.fullName,
    birthDate: currentRegistration.birthDate,
    city: currentRegistration.city,
    churchName: currentRegistration.churchName,
    phoneNumber: currentRegistration.phoneNumber,
    hasCar: currentRegistration.hasCar,
    hasChildren: currentRegistration.hasChildren,
    participants,
    emergencyContactName: currentRegistration.emergencyContactName,
    emergencyContactPhone: currentRegistration.emergencyContactPhone,
    accommodationPreference: currentRegistration.accommodationPreference,
    healthNotes: currentRegistration.healthNotes ?? '',
    allergyNotes: currentRegistration.allergyNotes ?? '',
    specialNeeds: currentRegistration.specialNeeds ?? '',
    motivation: currentRegistration.motivation ?? '',
    consentAccepted: currentRegistration.consentAccepted,
    submit: false,
  };
}

function collectRegistrationValidationErrors(
  form: SaveRegistrationRequest,
  selectedEvent: PublicEventDetails | null,
  requireConfirmedPhone: boolean,
  isPhoneConfirmed: boolean,
) {
  const errors: string[] = [];
  const hasActivePriceOptions = Boolean(selectedEvent?.priceOptions.some((option) => option.isActive));
  const primaryParticipantName = form.participants[0]?.fullName.trim() || form.fullName.trim();

  if (!selectedEvent) {
    errors.push('Сначала выберите мероприятие.');
    return errors;
  }

  if (!requireConfirmedPhone) {
    return errors;
  }

  if (hasActivePriceOptions && !form.selectedPriceOptionId) {
    errors.push('Выберите тариф участия.');
  }

  if (!form.contactEmail.trim()) {
    errors.push('Укажите email для связи.');
  } else if (!isValidEmail(form.contactEmail)) {
    errors.push('Проверьте формат email.');
  }

  if (!primaryParticipantName) {
    errors.push('Укажите имя основного участника.');
  }

  if (!form.birthDate) {
    errors.push('Укажите дату рождения основного участника.');
  }

  if (!form.city.trim()) {
    errors.push('Укажите город.');
  }

  if (!form.churchName.trim()) {
    errors.push('Укажите церковь.');
  }

  if (!form.phoneNumber.trim()) {
    errors.push('Укажите телефон участника.');
  } else if (!isValidPhone(form.phoneNumber)) {
    errors.push('Проверьте телефон участника.');
  }

  if (!form.emergencyContactName.trim()) {
    errors.push('Укажите доверенное лицо для экстренной связи.');
  }

  if (!form.emergencyContactPhone.trim()) {
    errors.push('Укажите телефон доверенного лица.');
  } else if (!isValidPhone(form.emergencyContactPhone)) {
    errors.push('Проверьте телефон доверенного лица.');
  }

  if (!form.consentAccepted) {
    errors.push('Подтвердите согласие на обработку персональных данных.');
  }

  if (requireConfirmedPhone && !isPhoneConfirmed) {
    errors.push('Подтвердите номер телефона перед отправкой заявки.');
  }

  return errors;
}

function buildPrefillForm(
  account: CurrentAccount | null,
  selectedEvent: PublicEventDetails,
  current: SaveRegistrationRequest,
): SaveRegistrationRequest {
  const defaultPriceOption = selectedEvent.priceOptions.find((option) => option.isDefault && isPriceOptionCurrentlyAvailable(option))
    ?? selectedEvent.priceOptions.find((option) => isPriceOptionCurrentlyAvailable(option))
    ?? selectedEvent.priceOptions.find((option) => option.isActive)
    ?? null;
  const preferredName = getPreferredName(account);
  const participants = preferredName
    ? [{ fullName: preferredName, isChild: false }]
    : current.participants.length
      ? current.participants
      : [{ ...EMPTY_PARTICIPANT }];

  return {
    ...current,
    selectedPriceOptionId: defaultPriceOption?.id ?? current.selectedPriceOptionId ?? null,
    contactEmail: getPreferredEmail(account),
    fullName: participants[0]?.fullName ?? '',
    participants,
    city: account?.user.city ?? '',
    churchName: account?.user.churchName ?? '',
    phoneNumber: account?.user.phoneNumber ?? '',
  };
}

function buildDraftPayload(form: SaveRegistrationRequest): SaveRegistrationRequest {
  const participants = ensureParticipants(form.participants, form.fullName)
    .map((participant) => ({
      fullName: participant.fullName.trim(),
      isChild: participant.isChild,
    }))
    .filter((participant) => participant.fullName);

  return {
    ...form,
    selectedPriceOptionId: form.selectedPriceOptionId ?? null,
    contactEmail: form.contactEmail.trim(),
    fullName: participants[0]?.fullName ?? form.fullName.trim(),
    birthDate: form.birthDate,
    city: form.city.trim(),
    churchName: form.churchName.trim(),
    phoneNumber: form.phoneNumber.trim(),
    hasChildren: form.hasChildren || participants.some((participant) => participant.isChild),
    participants,
    emergencyContactName: form.emergencyContactName.trim(),
    emergencyContactPhone: form.emergencyContactPhone.trim(),
    healthNotes: form.healthNotes?.trim() ?? '',
    allergyNotes: form.allergyNotes?.trim() ?? '',
    specialNeeds: form.specialNeeds?.trim() ?? '',
    motivation: form.motivation?.trim() ?? '',
    submit: false,
  };
}

export function CampRegistrationFlowPage() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEventSlug = new URLSearchParams(location.search).get('event');

  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PublicEventDetails | null>(null);
  const [registration, setRegistration] = useState<CampRegistration | null>(null);
  const [form, setForm] = useState<SaveRegistrationRequest>(() => createEmptyForm());
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingRegistration, setIsLoadingRegistration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationMode, setValidationMode] = useState<'draft' | 'submit' | null>(null);
  const [draftSyncState, setDraftSyncState] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle');
  const [draftSyncError, setDraftSyncError] = useState<string | null>(null);
  const [draftSyncAtUtc, setDraftSyncAtUtc] = useState<string | null>(null);
  const lastDraftSnapshotRef = useRef<string | null>(null);

  useEffect(() => {
    void loadEvents();
  }, [auth.account?.user.id, requestedEventSlug]);

  useEffect(() => {
    if (!selectedEventSlug) {
      setSelectedEvent(null);
      setRegistration(null);
      setDraftSyncState('idle');
      setDraftSyncError(null);
      setDraftSyncAtUtc(null);
      lastDraftSnapshotRef.current = null;
      return;
    }

    void loadSelectedEvent(selectedEventSlug);
  }, [selectedEventSlug, auth.account?.user.id]);

  const completedParticipants = useMemo(
    () => form.participants.filter((participant) => participant.fullName.trim()),
    [form.participants],
  );
  const participantsCount = Math.max(completedParticipants.length, 1);
  const childrenCount = completedParticipants.filter((participant) => participant.isChild).length;
  const effectiveHasChildren = form.hasChildren || childrenCount > 0;
  const preferredEmailSource = getIdentitySource(auth.account, form.contactEmail);
  const isPhoneConfirmed =
    Boolean(auth.account?.user.phoneNumberConfirmed) &&
    normalizePhone(form.phoneNumber) !== '' &&
    normalizePhone(form.phoneNumber) === normalizePhone(auth.account?.user.phoneNumber ?? '');
  const validationErrors = useMemo(
    () =>
      validationMode
        ? collectRegistrationValidationErrors(form, selectedEvent, validationMode === 'submit', isPhoneConfirmed)
        : [],
    [form, isPhoneConfirmed, selectedEvent, validationMode],
  );

  useEffect(() => {
    if (!selectedEvent || !selectedEventSlug || !auth.session?.accessToken || isLoadingRegistration || isSaving) {
      return undefined;
    }

    const payload = buildDraftPayload(form);
    const nextSnapshot = JSON.stringify(payload);
    if (nextSnapshot === lastDraftSnapshotRef.current) {
      return undefined;
    }

    setDraftSyncState('syncing');
    setDraftSyncError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          const saved = await auth.withSession((accessToken) =>
            saveEventRegistration(accessToken, selectedEventSlug, payload),
          );
          lastDraftSnapshotRef.current = nextSnapshot;
          setRegistration(saved);
          setDraftSyncState('saved');
          setDraftSyncError(null);
          setDraftSyncAtUtc(saved.updatedAtUtc);
        } catch (saveError) {
          setDraftSyncState('error');
          setDraftSyncError(
            saveError instanceof Error ? saveError.message : 'Не удалось автоматически сохранить черновик.',
          );
        }
      })();
    }, 1600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [auth, form, isLoadingRegistration, isSaving, selectedEvent, selectedEventSlug]);

  async function loadEvents() {
    setIsLoadingEvents(true);
    setError(null);
    setValidationMode(null);

    try {
      const response = await getPublicEvents();
      setEvents(response.events);
      const preferredSlug = pickPreferredEventSlug(response.events, auth.account?.registrations ?? [], requestedEventSlug);
      setSelectedEventSlug(preferredSlug);

      if (preferredSlug) {
        navigate(
          {
            pathname: '/camp-registration',
            search: `?event=${preferredSlug}`,
          },
          { replace: true },
        );
      }
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить список мероприятий.';
      setError(nextError);
      toast.error('Не удалось загрузить мероприятия', nextError);
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function loadSelectedEvent(eventSlug: string) {
    setIsLoadingRegistration(true);
    setError(null);
    setMessage(null);
    setValidationMode(null);
    setDraftSyncState('idle');
    setDraftSyncError(null);
    setDraftSyncAtUtc(null);
    lastDraftSnapshotRef.current = null;

    try {
      const [eventDetails, currentRegistration] = await Promise.all([
        getPublicEvent(eventSlug),
        auth.loadRegistration(eventSlug),
      ]);

      const nextForm = currentRegistration
        ? registrationToForm(currentRegistration)
        : buildPrefillForm(auth.account, eventDetails, createEmptyForm());

      setSelectedEvent(eventDetails);
      setRegistration(currentRegistration);
      setForm(nextForm);
      lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
      setDraftSyncState(currentRegistration ? 'saved' : 'idle');
      setDraftSyncError(null);
      setDraftSyncAtUtc(currentRegistration?.updatedAtUtc ?? null);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить выбранное мероприятие.';
      setError(nextError);
      toast.error('Не удалось открыть мероприятие', nextError);
      setSelectedEvent(null);
      setRegistration(null);
      setDraftSyncState('error');
      setDraftSyncError(nextError);
      setDraftSyncAtUtc(null);
    } finally {
      setIsLoadingRegistration(false);
    }
  }

  function updateParticipants(
    updater: (participants: EditableParticipant[]) => EditableParticipant[],
  ) {
    setForm((current) => syncParticipants(current, updater(current.participants)));
  }

  function setPrimaryParticipantName(fullName: string) {
    updateParticipants((participants) => {
      const nextParticipants = ensureParticipants(participants, '');
      const [firstParticipant, ...rest] = nextParticipants;
      return [{ ...firstParticipant, fullName }, ...rest];
    });
  }

  async function submit(submitMode: boolean) {
    const nextValidationMode = submitMode ? 'submit' : 'draft';
    const nextValidationErrors = collectRegistrationValidationErrors(form, selectedEvent, submitMode, isPhoneConfirmed);
    setValidationMode(nextValidationMode);

    if (!selectedEventSlug || !selectedEvent) {
      const nextError = 'Сначала выберите мероприятие.';
      setError(nextError);
      toast.error('Мероприятие не выбрано', nextError);
      return;
    }

    if (nextValidationErrors.length > 0) {
      const nextError = submitMode
        ? 'Перед отправкой заявки заполните обязательные поля и подтвердите контакты.'
        : 'Чтобы сохранить текущий черновик, заполните обязательные поля формы.';
      setError(nextError);
      setMessage(null);
      toast.error('Проверьте форму', nextValidationErrors[0]);
      return;
    }

    setValidationMode(null);
    const payload: SaveRegistrationRequest = {
      ...form,
      fullName: form.participants[0]?.fullName.trim() || form.fullName.trim(),
      participants: ensureParticipants(form.participants, form.fullName)
        .map((participant) => ({
          fullName: participant.fullName.trim(),
          isChild: participant.isChild,
        })),
      hasChildren: effectiveHasChildren,
      submit: submitMode,
    };

    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      const saved = await auth.saveRegistration(payload, selectedEventSlug);
      setRegistration(saved);
      const nextForm = registrationToForm(saved);
      setForm(nextForm);
      lastDraftSnapshotRef.current = JSON.stringify(buildDraftPayload(nextForm));
      setDraftSyncState('saved');
      setDraftSyncError(null);
      setDraftSyncAtUtc(saved.updatedAtUtc);
      const successMessage = submitMode ? 'Заявка отправлена команде.' : 'Черновик сохранён.';
      setMessage(successMessage);
      toast.success(submitMode ? 'Заявка отправлена' : 'Черновик сохранён', successMessage);
      await auth.reloadAccount();
    } catch (submitError) {
      const nextError =
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : 'Не удалось сохранить заявку.';
      setError(nextError);
      toast.error('Не удалось сохранить заявку', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  const availablePriceOptions = selectedEvent?.priceOptions.filter((option) => option.isActive) ?? [];

  return (
    <div className="page-stack">
      <header className="page-hero glass-card compact-hero">
        <div>
          <p className="mini-eyebrow">Мероприятия и заявки</p>
          <h2>{selectedEvent?.title || 'Выберите мероприятие'}</h2>
          <p>
            {selectedEvent
              ? `${selectedEvent.shortDescription} ${selectedEvent.location ? `Локация: ${selectedEvent.location}.` : ''}`
              : 'Сначала выберите нужное событие, затем заполните и сохраните заявку.'}
          </p>
        </div>

        <div className="status-badge">
          <span>Текущий статус</span>
          <strong>{formatStatus(registration?.status)}</strong>
        </div>
      </header>

      <section className="glass-card stack-form">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Выбор события</p>
            <h3>Сезоны, выезды и другие мероприятия</h3>
          </div>
          <p className="form-muted">Можно переключаться между событиями без потери логики регистрации и статусов.</p>
        </div>

        <div className="event-switch-grid">
          {events.map((eventItem) => (
            <button
              key={eventItem.id}
              className={`event-switch-card${selectedEventSlug === eventItem.slug ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setSelectedEventSlug(eventItem.slug);
                navigate(
                  {
                    pathname: '/camp-registration',
                    search: `?event=${eventItem.slug}`,
                  },
                  { replace: true },
                );
              }}
            >
              <span className="mini-eyebrow">{eventItem.seasonLabel || eventItem.seriesTitle}</span>
              <strong>{eventItem.title}</strong>
              <span>{formatDateRangeCompact(eventItem.startsAtUtc, eventItem.endsAtUtc)}</span>
              <span>{eventItem.location || 'Локация уточняется'}</span>
              <span>
                {eventItem.priceFromAmount != null
                  ? `от ${formatMoney(eventItem.priceFromAmount, eventItem.priceCurrency || 'RUB')}`
                  : 'Цена уточняется'}
              </span>
            </button>
          ))}
        </div>

        {!events.length && !isLoadingEvents ? (
          <p className="form-muted">Пока нет опубликованных мероприятий, доступных для регистрации.</p>
        ) : null}
      </section>

      <section className="glass-card stack-form">
        {isLoadingEvents || isLoadingRegistration ? (
          <p className="form-muted">Загружаем выбранное мероприятие и вашу текущую заявку...</p>
        ) : selectedEvent ? (
          <>
            <div className="user-info-grid">
              <div>
                <span>Даты</span>
                <strong>{formatDateRangeCompact(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</strong>
              </div>
              <div>
                <span>Регистрация до</span>
                <strong>{formatDateTime(selectedEvent.registrationClosesAtUtc)}</strong>
              </div>
              <div>
                <span>Места</span>
                <strong>{selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'}</strong>
              </div>
              <div>
                <span>Участников в заявке</span>
                <strong>{participantsCount}</strong>
              </div>
            </div>

            {availablePriceOptions.length ? (
              <div className="price-option-list">
                {availablePriceOptions.map((option) => {
                  const isAvailable = isPriceOptionCurrentlyAvailable(option);
                  const isSelected = form.selectedPriceOptionId === option.id;

                  return (
                    <label className={`price-option-card${isSelected ? ' active' : ''}`} key={option.id}>
                      <input
                        type="radio"
                        name="priceOption"
                        value={option.id}
                        checked={isSelected}
                        onChange={() => setForm((current) => ({ ...current, selectedPriceOptionId: option.id }))}
                      />
                      <span>{option.title}</span>
                      <strong>{formatMoney(option.amount, option.currency)}</strong>
                      <em>{option.description || (isAvailable ? 'Тариф доступен для выбора' : 'Тариф пока недоступен')}</em>
                    </label>
                  );
                })}
              </div>
            ) : null}

            <div className="registration-section-grid">
              <section className="glass-subcard stack-form">
                <div className="section-inline">
                  <div>
                    <p className="mini-eyebrow">Контакты</p>
                    <h3>Связь с участником</h3>
                  </div>
                  <p className="form-muted">Email и телефон нужны для подтверждений, напоминаний и связи по заявке.</p>
                </div>

                <div className="form-grid">
                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={form.contactEmail}
                      onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                      required
                    />
                    {preferredEmailSource ? (
                      <small className="form-muted">Подтянули из привязанного входа через {preferredEmailSource}.</small>
                    ) : null}
                  </label>

                  <label>
                    <span>Телефон</span>
                    <input
                      value={form.phoneNumber}
                      onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                      required
                    />
                    <small className={`form-muted${registration?.phoneNumberConfirmed || auth.account?.user.phoneNumberConfirmed ? ' form-success-inline' : ''}`}>
                      {isPhoneConfirmed
                        ? 'Номер подтверждён в профиле.'
                        : 'Подтвердите номер, чтобы отправить заявку без ошибок на финальном шаге.'}
                    </small>
                  </label>
                </div>

                <PhoneVerificationPanel
                  accessToken={auth.session?.accessToken ?? null}
                  phoneNumber={form.phoneNumber}
                  isConfirmed={isPhoneConfirmed}
                  onPhoneNumberChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
                  onAccountReload={auth.reloadAccount}
                  onVerified={async () => {
                    setMessage('Телефон подтверждён. Можно отправлять заявку.');
                    setError(null);
                    toast.success('Телефон подтверждён', 'Номер готов для уведомлений и отправки заявки.');
                  }}
                />
              </section>

              <section className="glass-subcard stack-form">
                <div className="section-inline">
                  <div>
                    <p className="mini-eyebrow">Состав</p>
                    <h3>Кто едет на кэмп</h3>
                  </div>
                  <p className="form-muted">Количество считается автоматически по списку участников.</p>
                </div>

                <div className="participant-summary-row">
                  <span className="role-pill">Участников: {participantsCount}</span>
                  <span className="role-pill">Детей: {childrenCount}</span>
                </div>

                <div className="participant-list">
                  {form.participants.map((participant, index) => (
                    <article className="participant-card" key={`participant-${index}`}>
                      <div className="participant-card-header">
                        <strong>{index === 0 ? 'Основной участник' : `Участник ${index + 1}`}</strong>
                        {form.participants.length > 1 ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => updateParticipants((items) => items.filter((_, currentIndex) => currentIndex !== index))}
                          >
                            Удалить
                          </button>
                        ) : null}
                      </div>

                      <div className="form-grid">
                        <label>
                          <span>ФИО</span>
                          <input
                            value={participant.fullName}
                            onChange={(event) => {
                              const fullName = event.target.value;
                              if (index === 0) {
                                setPrimaryParticipantName(fullName);
                                return;
                              }

                              updateParticipants((items) =>
                                items.map((item, currentIndex) =>
                                  currentIndex === index
                                    ? { ...item, fullName }
                                    : item,
                                ),
                              );
                            }}
                            required={index === 0}
                          />
                        </label>

                        <label className="checkbox-row compact-checkbox-row">
                          <input
                            type="checkbox"
                            checked={participant.isChild}
                            onChange={(event) =>
                              updateParticipants((items) =>
                                items.map((item, currentIndex) =>
                                  currentIndex === index
                                    ? { ...item, isChild: event.target.checked }
                                    : item,
                                ),
                              )
                            }
                          />
                          <span>Ребёнок</span>
                        </label>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="inline-links">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => updateParticipants((items) => [...items, { ...EMPTY_PARTICIPANT }])}
                  >
                    Добавить участника
                  </button>
                </div>
              </section>
            </div>

            <div className="registration-section-grid">
              <section className="glass-subcard stack-form">
                <div className="section-inline">
                  <div>
                    <p className="mini-eyebrow">Детали поездки</p>
                    <h3>Размещение и логистика</h3>
                  </div>
                  <p className="form-muted">Здесь собираем всё, что важно для распределения по местам и быта на кэмпе.</p>
                </div>

                <div className="form-grid">
                  <label>
                    <span>Дата рождения основного участника</span>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Предпочтение по размещению</span>
                    <select
                      value={form.accommodationPreference}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          accommodationPreference: event.target.value as AccommodationPreference,
                        }))
                      }
                    >
                      <option value="Either">Подойдёт любой формат</option>
                      <option value="Tent">Палатка</option>
                      <option value="Cabin">Домик</option>
                    </select>
                  </label>

                  <label>
                    <span>Город</span>
                    <input
                      value={form.city}
                      onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Церковь</span>
                    <input
                      value={form.churchName}
                      onChange={(event) => setForm((current) => ({ ...current, churchName: event.target.value }))}
                      required
                    />
                  </label>
                </div>

                <div className="checkbox-grid">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.hasCar}
                      onChange={(event) => setForm((current) => ({ ...current, hasCar: event.target.checked }))}
                    />
                    <span>Есть автомобиль</span>
                  </label>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={effectiveHasChildren}
                      onChange={(event) => setForm((current) => ({ ...current, hasChildren: event.target.checked }))}
                    />
                    <span>Есть дети или это нужно учесть в размещении</span>
                  </label>
                </div>
              </section>

              <section className="glass-subcard stack-form">
                <div className="section-inline">
                  <div>
                    <p className="mini-eyebrow">Безопасность</p>
                    <h3>Контакт на случай срочной связи</h3>
                  </div>
                  <p className="form-muted">Эти данные видит только команда мероприятия и использует при необходимости.</p>
                </div>

                <div className="form-grid">
                  <label>
                    <span>Контакт доверенного лица</span>
                    <input
                      value={form.emergencyContactName}
                      onChange={(event) => setForm((current) => ({ ...current, emergencyContactName: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    <span>Телефон доверенного лица</span>
                    <input
                      value={form.emergencyContactPhone}
                      onChange={(event) => setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                      required
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="form-grid single-column">
              <label>
                <span>Особенности здоровья</span>
                <textarea
                  rows={4}
                  value={form.healthNotes}
                  onChange={(event) => setForm((current) => ({ ...current, healthNotes: event.target.value }))}
                />
              </label>

              <label>
                <span>Аллергии или ограничения</span>
                <textarea
                  rows={4}
                  value={form.allergyNotes}
                  onChange={(event) => setForm((current) => ({ ...current, allergyNotes: event.target.value }))}
                />
              </label>

              <label>
                <span>Особые нужды</span>
                <textarea
                  rows={4}
                  value={form.specialNeeds}
                  onChange={(event) => setForm((current) => ({ ...current, specialNeeds: event.target.value }))}
                />
              </label>

              <label>
                <span>Почему вы хотите поехать</span>
                <textarea
                  rows={5}
                  value={form.motivation}
                  onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))}
                />
              </label>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.consentAccepted}
                onChange={(event) =>
                  setForm((current) => ({ ...current, consentAccepted: event.target.checked }))
                }
              />
              <span>Соглашаюсь на обработку персональных данных и передачу анкеты команде мероприятия.</span>
            </label>

            {message ? <p className="form-success">{message}</p> : null}
            {validationErrors.length ? (
              <div className="validation-summary">
                <strong>
                  {validationMode === 'submit'
                    ? 'Перед отправкой осталось проверить:'
                    : 'Перед сохранением заполните:'}
                </strong>
                <ul className="validation-list">
                  {validationErrors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
            {!error && draftSyncError ? <p className="form-error draft-sync-status">Автосохранение не удалось: {draftSyncError}</p> : null}
            {!error && !draftSyncError && draftSyncState === 'syncing' ? (
              <p className="form-muted draft-sync-status">Черновик синхронизируется с сервером...</p>
            ) : null}
            {!error && !draftSyncError && draftSyncState === 'saved' && draftSyncAtUtc ? (
              <p className="form-muted draft-sync-status">Черновик сохранён автоматически в {formatTimeOnly(draftSyncAtUtc)}.</p>
            ) : null}

            <div className="inline-links">
              <NavLink to="/profile">Открыть профиль</NavLink>
            </div>

            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                disabled={isSaving}
                onClick={async () => submit(false)}
              >
                {isSaving ? 'Сохраняем...' : 'Сохранить черновик'}
              </button>

              <button
                className="primary-button"
                type="button"
                disabled={isSaving}
                onClick={async () => submit(true)}
              >
                {isSaving ? 'Отправляем...' : 'Отправить заявку'}
              </button>
            </div>
          </>
        ) : (
          <p className="form-muted">Выберите мероприятие из списка выше, чтобы открыть анкету.</p>
        )}
      </section>
    </div>
  );
}
