import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, submitGuestEventRegistration } from '../lib/api';
import type {
  AccommodationPreference,
  CampRegistration,
  PublicEventDetails,
  PublicEventSummary,
  SaveRegistrationRequest,
} from '../types';

type RegistrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  events: PublicEventSummary[];
  selectedEvent: PublicEventDetails | null;
  selectedEventSlug: string | null;
  onSelectEvent: (slug: string) => void;
  onSubmitted?: (registration: CampRegistration) => void;
};

type EditableParticipant = {
  fullName: string;
  phoneNumber?: string;
  birthDate?: string;
  isChild: boolean;
};

type HelpTopic = 'health' | 'allergy' | 'wishes';

const EMPTY_PARTICIPANT: EditableParticipant = {
  fullName: '',
  phoneNumber: '',
  birthDate: '',
  isChild: false,
};
const DEFAULT_CITY = 'Новосибирск';
const DEFAULT_CHURCH_NAME = 'Благодать';
const MINIMUM_PARTICIPANT_AGE = 16;
const ADULT_PARTICIPANT_AGE = 18;
const PLACE_URL = 'https://2gis.ru/gornoaltaysk/firm/70000001077460445/87.929919%2C50.228723';
const CAMP_LOCATION_FULL = 'Экоаил, ул. Мира, 7а, село Курай, Кош-Агачский район, Республика Алтай';

function createEmptyForm(): SaveRegistrationRequest {
  return {
    selectedPriceOptionId: null,
    contactEmail: '',
    fullName: '',
    birthDate: '',
    city: DEFAULT_CITY,
    churchName: DEFAULT_CHURCH_NAME,
    phoneNumber: '',
    hasCar: false,
    hasChildren: false,
    participants: [{ ...EMPTY_PARTICIPANT }],
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Tent',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: true,
  };
}

function normalizeAccommodationPreference(value?: AccommodationPreference | null): AccommodationPreference {
  return value === 'Either' || value === 'Tent' ? value : 'Tent';
}

function getDraftStorageKey(eventSlug?: string | null) {
  return eventSlug ? `blagodaty.camp.guest-draft:${eventSlug}` : null;
}

function isPriceOptionCurrentlyAvailable(option: {
  isActive: boolean;
  salesStartsAtUtc?: string | null;
  salesEndsAtUtc?: string | null;
}) {
  if (!option.isActive) {
    return false;
  }

  const now = Date.now();
  const startsAt = option.salesStartsAtUtc ? new Date(option.salesStartsAtUtc).getTime() : null;
  const endsAt = option.salesEndsAtUtc ? new Date(option.salesEndsAtUtc).getTime() : null;

  return (startsAt === null || startsAt <= now) && (endsAt === null || endsAt >= now);
}

function getDefaultPriceOptionId(selectedEvent: PublicEventDetails | null) {
  if (!selectedEvent) {
    return null;
  }

  return (
    selectedEvent.priceOptions.find((option) => option.isDefault && isPriceOptionCurrentlyAvailable(option)) ??
    selectedEvent.priceOptions.find((option) => isPriceOptionCurrentlyAvailable(option)) ??
    selectedEvent.priceOptions.find((option) => option.isActive) ??
    null
  )?.id ?? null;
}

function readDraftForm(storageKey: string | null): SaveRegistrationRequest | null {
  if (!storageKey || typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SaveRegistrationRequest>;
    const participants = Array.isArray(parsed.participants)
      ? parsed.participants.map((participant) => ({
          fullName: typeof participant?.fullName === 'string' ? participant.fullName : '',
          phoneNumber: typeof participant?.phoneNumber === 'string' ? participant.phoneNumber : '',
          birthDate: typeof participant?.birthDate === 'string' ? participant.birthDate : '',
          isChild: Boolean(participant?.isChild),
        }))
      : [{ ...EMPTY_PARTICIPANT }];

    return {
      ...createEmptyForm(),
      ...parsed,
      selectedPriceOptionId:
        typeof parsed.selectedPriceOptionId === 'string' || parsed.selectedPriceOptionId === null
          ? parsed.selectedPriceOptionId ?? null
          : null,
      contactEmail: typeof parsed.contactEmail === 'string' ? parsed.contactEmail : '',
      fullName: typeof parsed.fullName === 'string' ? parsed.fullName : '',
      birthDate: typeof parsed.birthDate === 'string' ? parsed.birthDate : '',
      city: DEFAULT_CITY,
      churchName: DEFAULT_CHURCH_NAME,
      phoneNumber: typeof parsed.phoneNumber === 'string' ? parsed.phoneNumber : '',
      emergencyContactName: typeof parsed.emergencyContactName === 'string' ? parsed.emergencyContactName : '',
      emergencyContactPhone: typeof parsed.emergencyContactPhone === 'string' ? parsed.emergencyContactPhone : '',
      accommodationPreference: normalizeAccommodationPreference(parsed.accommodationPreference),
      healthNotes: typeof parsed.healthNotes === 'string' ? parsed.healthNotes : '',
      allergyNotes: typeof parsed.allergyNotes === 'string' ? parsed.allergyNotes : '',
      specialNeeds: typeof parsed.specialNeeds === 'string' ? parsed.specialNeeds : '',
      motivation: typeof parsed.motivation === 'string' ? parsed.motivation : '',
      hasCar: Boolean(parsed.hasCar),
      hasChildren: Boolean(parsed.hasChildren),
      consentAccepted: Boolean(parsed.consentAccepted),
      participants: participants.length ? participants : [{ ...EMPTY_PARTICIPANT }],
      submit: true,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeDraftForm(storageKey: string | null, form: SaveRegistrationRequest) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify({ ...form, submit: true }));
}

function clearDraftForm(storageKey: string | null) {
  if (!storageKey || typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(storageKey);
}

function formatDateRangeCompact(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return 'Даты уточняются';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  });

  return endsAtUtc
    ? `${formatter.format(new Date(startsAtUtc))} - ${formatter.format(new Date(endsAtUtc))}`
    : formatter.format(new Date(startsAtUtc));
}

function formatDateRangeLong(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  return formatDateRangeLongParts(startsAtUtc, endsAtUtc).join(' - ');
}

function formatDateRangeLongParts(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return ['Даты уточняются'];
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const starts = formatter.format(new Date(startsAtUtc));
  if (!endsAtUtc) {
    return [starts];
  }

  const ends = formatter.format(new Date(endsAtUtc));
  return starts === ends ? [starts] : [starts, ends];
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

function normalizePhone(value?: string | null) {
  if (!value) {
    return '';
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return value.trim();
  }

  if (digits.length === 11 && digits.startsWith('8')) {
    return `+7${digits.slice(1)}`;
  }

  return digits.length >= 10 ? `+${digits}` : value.trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhone(value: string) {
  return /^\+\d{10,15}$/.test(normalizePhone(value));
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return { year, month, day };
}

function getAgeAtDate(birthDateValue: string, targetDateValue?: string | null) {
  const birthDate = parseDateInput(birthDateValue);
  const targetDate = targetDateValue ? new Date(targetDateValue) : new Date();
  if (!birthDate || Number.isNaN(targetDate.getTime())) {
    return null;
  }

  let age = targetDate.getFullYear() - birthDate.year;
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();
  if (targetMonth < birthDate.month || (targetMonth === birthDate.month && targetDay < birthDate.day)) {
    age -= 1;
  }

  return age;
}

function isMinimumAgeReached(birthDateValue: string, eventStartsAtUtc?: string | null) {
  const age = getAgeAtDate(birthDateValue, eventStartsAtUtc);
  return age !== null && age >= MINIMUM_PARTICIPANT_AGE;
}

function isMinorParticipant(birthDateValue: string | undefined, eventStartsAtUtc?: string | null) {
  if (!birthDateValue) {
    return false;
  }

  const age = getAgeAtDate(birthDateValue, eventStartsAtUtc);
  return age !== null && age >= MINIMUM_PARTICIPANT_AGE && age < 18;
}

function ensureParticipants(
  participants: EditableParticipant[],
  fallbackFullName = '',
  primaryBirthDate = '',
  eventStartsAtUtc?: string | null,
) {
  const sanitized = participants
    .map((participant, index) => {
      const birthDate = (index === 0 ? primaryBirthDate || participant.birthDate : participant.birthDate) ?? '';
      return {
        fullName: participant.fullName.trim(),
        phoneNumber: participant.phoneNumber?.trim() ?? '',
        birthDate,
        isChild: birthDate ? isMinorParticipant(birthDate, eventStartsAtUtc) : participant.isChild,
      };
    })
    .filter((participant) => participant.fullName);

  if (sanitized.length > 0) {
    return sanitized;
  }

  return fallbackFullName.trim()
    ? [
        {
          fullName: fallbackFullName.trim(),
          phoneNumber: '',
          birthDate: primaryBirthDate,
          isChild: false,
        },
      ]
    : [];
}

function buildSubmitPayload(form: SaveRegistrationRequest, selectedEvent: PublicEventDetails): SaveRegistrationRequest {
  const participants = ensureParticipants(form.participants, form.fullName, form.birthDate, selectedEvent.startsAtUtc)
    .map((participant, index) => ({
      ...participant,
      phoneNumber: index === 0 ? normalizePhone(form.phoneNumber) : normalizePhone(participant.phoneNumber),
    }));

  return {
    ...form,
    selectedPriceOptionId: form.selectedPriceOptionId ?? null,
    contactEmail: form.contactEmail.trim(),
    fullName: participants[0]?.fullName ?? form.fullName.trim(),
    birthDate: form.birthDate,
    city: DEFAULT_CITY,
    churchName: DEFAULT_CHURCH_NAME,
    phoneNumber: normalizePhone(form.phoneNumber),
    hasChildren: form.hasChildren || participants.some((participant) => participant.isChild),
    participants,
    emergencyContactName: form.emergencyContactName.trim(),
    emergencyContactPhone: normalizePhone(form.emergencyContactPhone),
    accommodationPreference: 'Tent',
    healthNotes: form.healthNotes?.trim() ?? '',
    allergyNotes: form.allergyNotes?.trim() ?? '',
    specialNeeds: '',
    motivation: form.motivation?.trim() ?? '',
    submit: true,
  };
}

function collectRegistrationValidationErrors(form: SaveRegistrationRequest, selectedEvent: PublicEventDetails | null) {
  const errors: string[] = [];
  const hasActivePriceOptions = Boolean(selectedEvent?.priceOptions.some((option) => option.isActive));
  const primaryParticipantName = form.participants[0]?.fullName.trim() || form.fullName.trim();

  if (!selectedEvent) {
    errors.push('Сначала выберите мероприятие.');
    return errors;
  }

  if (!selectedEvent.isRegistrationOpen) {
    errors.push('Регистрация на это мероприятие сейчас закрыта.');
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
  } else if (!isMinimumAgeReached(form.birthDate, selectedEvent.startsAtUtc)) {
    errors.push(`К участию допускаются участники с ${MINIMUM_PARTICIPANT_AGE} лет на дату начала похода.`);
  }

  const normalizedParticipants = ensureParticipants(
    form.participants,
    form.fullName,
    form.birthDate,
    selectedEvent.startsAtUtc,
  );
  normalizedParticipants.slice(1).forEach((participant) => {
    if (participant.birthDate && !isMinimumAgeReached(participant.birthDate, selectedEvent.startsAtUtc)) {
      errors.push(`Участнику ${participant.fullName} должно быть не меньше ${MINIMUM_PARTICIPANT_AGE} лет на дату начала похода.`);
    }
  });

  const hasMinorParticipant = normalizedParticipants.some((participant) =>
    isMinorParticipant(participant.birthDate, selectedEvent.startsAtUtc),
  );
  const primaryAge = form.birthDate ? getAgeAtDate(form.birthDate, selectedEvent.startsAtUtc) : null;
  if (normalizedParticipants.length > 1 && (primaryAge === null || primaryAge < ADULT_PARTICIPANT_AGE)) {
    errors.push('Добавить участника может только взрослый основной участник.');
  }

  if (hasMinorParticipant && (primaryAge === null || primaryAge < ADULT_PARTICIPANT_AGE)) {
    errors.push('Участника 16-17 лет может зарегистрировать только взрослый родитель или сопровождающий.');
  }

  if (!form.phoneNumber.trim()) {
    errors.push('Укажите телефон участника.');
  } else if (!isValidPhone(form.phoneNumber)) {
    errors.push('Проверьте телефон участника.');
  }

  form.participants.slice(1).forEach((participant, index) => {
    const participantNumber = index + 2;
    const name = participant.fullName.trim();
    const phone = participant.phoneNumber?.trim() ?? '';

    if (!name && !phone) {
      errors.push(`Заполните или удалите участника ${participantNumber}.`);
      return;
    }

    if (!name) {
      errors.push(`Укажите ФИО участника ${participantNumber}.`);
    }

    if (!phone) {
      errors.push(`Укажите телефон участника ${name || participantNumber}.`);
    } else if (!isValidPhone(phone)) {
      errors.push(`Проверьте телефон участника ${name || participantNumber}.`);
    }
  });

  if (form.emergencyContactPhone.trim() && !isValidPhone(form.emergencyContactPhone)) {
    errors.push('Проверьте телефон доверенного лица.');
  }

  if (!form.consentAccepted) {
    errors.push('Подтвердите согласие на обработку персональных данных.');
  }

  return errors;
}

function buildInitialForm(selectedEvent: PublicEventDetails | null) {
  return {
    ...createEmptyForm(),
    selectedPriceOptionId: getDefaultPriceOptionId(selectedEvent),
  };
}

export function RegistrationModal({
  isOpen,
  onClose,
  events,
  selectedEvent,
  selectedEventSlug,
  onSelectEvent,
  onSubmitted,
}: RegistrationModalProps) {
  const [form, setForm] = useState<SaveRegistrationRequest>(() => buildInitialForm(null));
  const [completedRegistration, setCompletedRegistration] = useState<CampRegistration | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [validationMode, setValidationMode] = useState(false);
  const [activeHelpTopic, setActiveHelpTopic] = useState<HelpTopic | null>(null);
  const validationSummaryRef = useRef<HTMLDivElement | null>(null);

  const draftStorageKey = useMemo(() => getDraftStorageKey(selectedEvent?.slug ?? selectedEventSlug), [selectedEvent?.slug, selectedEventSlug]);
  const availablePriceOptions = useMemo(
    () => selectedEvent?.priceOptions.filter((option) => option.isActive) ?? [],
    [selectedEvent?.priceOptions],
  );
  const completedParticipants = useMemo(
    () => ensureParticipants(form.participants, form.fullName, form.birthDate, selectedEvent?.startsAtUtc),
    [form.birthDate, form.fullName, form.participants, selectedEvent?.startsAtUtc],
  );
  const participantsCount = completedParticipants.length || 1;
  const primaryAge = form.birthDate ? getAgeAtDate(form.birthDate, selectedEvent?.startsAtUtc) : null;
  const canAddParticipant = primaryAge !== null && primaryAge >= ADULT_PARTICIPANT_AGE;
  const validationErrors = validationMode ? collectRegistrationValidationErrors(form, selectedEvent) : [];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setFormError(null);
      setValidationMode(false);
      setCompletedRegistration(null);
      setActiveHelpTopic(null);
      return;
    }

    const draft = readDraftForm(draftStorageKey);
    const defaultPriceOptionId = getDefaultPriceOptionId(selectedEvent);
    setForm({
      ...(draft ?? buildInitialForm(selectedEvent)),
      selectedPriceOptionId: draft?.selectedPriceOptionId ?? defaultPriceOptionId,
    });
    setFormError(null);
    setValidationMode(false);
    setCompletedRegistration(null);
    setActiveHelpTopic(null);
  }, [draftStorageKey, isOpen, selectedEvent]);

  useEffect(() => {
    if (!isOpen || completedRegistration) {
      return;
    }

    writeDraftForm(draftStorageKey, form);
  }, [completedRegistration, draftStorageKey, form, isOpen]);

  useEffect(() => {
    if (validationErrors.length) {
      validationSummaryRef.current?.focus();
    }
  }, [validationErrors.length]);

  if (!isOpen) {
    return null;
  }

  const sidebarDateParts = selectedEvent ? formatDateRangeLongParts(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc) : [];
  const sidebarCapacity = selectedEvent ? selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита' : null;
  const isSidebarCapacityNumber = typeof sidebarCapacity === 'number';

  function updateParticipants(updater: (participants: EditableParticipant[]) => EditableParticipant[]) {
    setForm((current) => {
      const nextParticipants = updater(current.participants);
      const normalizedParticipants = nextParticipants.length ? nextParticipants : [{ ...EMPTY_PARTICIPANT }];
      return {
        ...current,
        participants: normalizedParticipants,
        fullName: normalizedParticipants[0]?.fullName ?? '',
        hasChildren:
          ensureParticipants(
            normalizedParticipants,
            current.fullName,
            current.birthDate,
            selectedEvent?.startsAtUtc,
          ).some((participant) => participant.isChild),
      };
    });
  }

  function renderHelpButton(topic: HelpTopic, text: string, label: string) {
    const isActive = activeHelpTopic === topic;

    return (
      <span className={`field-help-wrap${isActive ? ' active' : ''}`}>
        <button
          className="field-help"
          type="button"
          aria-label={label}
          aria-expanded={isActive}
          aria-controls={`field-help-${topic}`}
          onClick={(event) => {
            event.preventDefault();
            setActiveHelpTopic((current) => (current === topic ? null : topic));
          }}
        >
          ?
        </button>
        <span className="field-help-popover" id={`field-help-${topic}`} role="tooltip">
          {text}
        </span>
      </span>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMode(true);
    setFormError(null);

    const errors = collectRegistrationValidationErrors(form, selectedEvent);
    if (errors.length || !selectedEvent) {
      return;
    }

    setIsSaving(true);
    try {
      const saved = await submitGuestEventRegistration(selectedEvent.slug, buildSubmitPayload(form, selectedEvent));
      setCompletedRegistration(saved);
      clearDraftForm(draftStorageKey);
      onSubmitted?.(saved);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-root" aria-hidden={!isOpen}>
      <div className="modal-backdrop" onClick={onClose} />

      <section className="modal-shell" role="dialog" aria-modal="true" aria-labelledby="camp-modal-title">
        <aside className="modal-sidebar">
          <div className="modal-sidebar-head">
            <p className="section-kicker">Регистрация</p>
            <h2 id="camp-modal-title">Анкета участника</h2>
          </div>

          {selectedEvent ? (
            <article className="modal-event-summary">
              <span className="summary-chip">{selectedEvent.seasonLabel || selectedEvent.seriesTitle}</span>
              <strong className="modal-event-title">{selectedEvent.title}</strong>
              <div className="modal-summary-list">
                <div className="modal-summary-item">
                  <span className="modal-summary-label">Даты</span>
                  <span className="modal-summary-value modal-summary-date-lines">
                    {sidebarDateParts.map((datePart) => (
                      <span key={datePart}>{datePart}</span>
                    ))}
                  </span>
                </div>

                <a className="modal-summary-item modal-summary-location" href={PLACE_URL} target="_blank" rel="noreferrer">
                  <span className="modal-summary-label">Место</span>
                  <span className="modal-summary-value">
                    <span>Экоаил, ул. Мира, 7а</span>
                    <span>село Курай</span>
                    <span>Кош-Агачский район, Республика Алтай</span>
                  </span>
                </a>

                <div className="modal-summary-item modal-summary-capacity">
                  <span className="modal-summary-label">Мест осталось</span>
                  <span className="modal-summary-value modal-summary-capacity-value">
                    <span className="modal-summary-capacity-number">{sidebarCapacity}</span>
                    {isSidebarCapacityNumber ? <span className="modal-summary-capacity-unit">мест</span> : null}
                  </span>
                </div>
              </div>
            </article>
          ) : null}
        </aside>

        <div className="modal-main">
          <button className="modal-close" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>

          {completedRegistration ? (
            <div className="modal-success-view">
              <p className="section-kicker">Заявка отправлена</p>
              <h3>Спасибо, мы получили анкету</h3>
              <p>Организаторы свяжутся с вами по указанным контактам.</p>

              <div className="success-summary-grid">
                <article>
                  <span>Участник</span>
                  <strong>{completedRegistration.fullName}</strong>
                </article>
                <article>
                  <span>Участников</span>
                  <strong>{completedRegistration.participantsCount}</strong>
                </article>
                <article>
                  <span>Email</span>
                  <strong>{completedRegistration.contactEmail}</strong>
                </article>
                <article>
                  <span>Телефон</span>
                  <strong>{completedRegistration.phoneNumber}</strong>
                </article>
              </div>

              <button className="button button-primary" type="button" onClick={onClose}>
                Готово
              </button>
            </div>
          ) : (
            <form className="modal-form-layout" noValidate onSubmit={handleSubmit}>
              {events.length > 1 ? (
                <section className="modal-panel" ref={null}>
                  <div className="section-inline">
                    <div>
                      <p className="section-kicker">Мероприятие</p>
                      <h3>Выберите сезон</h3>
                    </div>
                  </div>

                  <div className="modal-event-grid">
                    {events.map((eventItem) => (
                      <button
                        className={`modal-event-card${eventItem.slug === selectedEventSlug ? ' active' : ''}`}
                        key={eventItem.id}
                        type="button"
                        onClick={() => onSelectEvent(eventItem.slug)}
                      >
                        <span>{eventItem.seasonLabel || eventItem.seriesTitle}</span>
                        <strong>{eventItem.title}</strong>
                        <em>{formatDateRangeCompact(eventItem.startsAtUtc, eventItem.endsAtUtc)}</em>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {selectedEvent ? (
                <>
                  <section className="modal-panel">
                    <div className="section-inline">
                      <div>
                        <p className="section-kicker">Данные заявки</p>
                        <h3>{selectedEvent.title}</h3>
                      </div>
                      <span className="summary-chip">{selectedEvent.isRegistrationOpen ? 'Регистрация открыта' : 'Регистрация закрыта'}</span>
                    </div>

                    <div className="modal-metrics-grid">
                      <article>
                        <span>Даты</span>
                        <strong>{formatDateRangeLong(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</strong>
                      </article>
                      <article>
                        <span>Локация</span>
                        <a className="metric-link" href={PLACE_URL} target="_blank" rel="noreferrer">
                          {CAMP_LOCATION_FULL}
                        </a>
                      </article>
                      <article>
                        <span>Мест осталось</span>
                        <strong>{selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'}</strong>
                      </article>
                      <article>
                        <span>В заявке</span>
                        <strong>{participantsCount} чел.</strong>
                      </article>
                    </div>

                    {availablePriceOptions.length ? (
                      <div className="price-option-list">
                        {availablePriceOptions.map((option) => {
                          const isSelected = form.selectedPriceOptionId === option.id;
                          const isAvailable = isPriceOptionCurrentlyAvailable(option);

                          return (
                            <label className={`price-option-card${isSelected ? ' active' : ''}`} key={option.id}>
                              <span className="price-option-check">
                                <input
                                  type="radio"
                                  name="priceOption"
                                  value={option.id}
                                  checked={isSelected}
                                  onChange={() => setForm((current) => ({ ...current, selectedPriceOptionId: option.id }))}
                                />
                              </span>
                              <span className="price-option-copy">
                                <span>{option.title}</span>
                                <strong>{formatMoney(option.amount, option.currency)}</strong>
                                <em>{option.description || (isAvailable ? 'Доступен для выбора' : 'Сейчас недоступен')}</em>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {validationErrors.length ? (
                      <div className="validation-summary" ref={validationSummaryRef} tabIndex={-1}>
                        <strong>Перед отправкой заполните:</strong>
                        <ul className="validation-list">
                          {validationErrors.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </section>

                  <section className="modal-section-grid registration-contacts-grid">
                    <div className="modal-subpanel registration-contacts-panel">
                      <h4>Контакты</h4>

                      <div className="modal-form-grid contacts-grid">
                        <label>
                          <span>ФИО</span>
                          <input
                            value={form.participants[0]?.fullName ?? ''}
                            onChange={(event) => {
                              const fullName = event.target.value;
                              updateParticipants((items) =>
                                (items.length ? items : [{ ...EMPTY_PARTICIPANT }]).map((item, index) =>
                                  index === 0 ? { ...item, fullName } : item,
                                ),
                              );
                            }}
                            required
                          />
                        </label>

                        <label>
                          <span>Телефон</span>
                          <input
                            value={form.phoneNumber}
                            inputMode="tel"
                            placeholder="+7"
                            onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                            required
                          />
                        </label>

                        <label>
                          <span>Email</span>
                          <input
                            type="email"
                            value={form.contactEmail}
                            onChange={(event) => setForm((current) => ({ ...current, contactEmail: event.target.value }))}
                            required
                          />
                        </label>

                        <label>
                          <span>Дата рождения основного участника</span>
                          <input
                            type="date"
                            value={form.birthDate}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                birthDate: event.target.value,
                                hasChildren:
                                  isMinorParticipant(event.target.value, selectedEvent?.startsAtUtc) ||
                                  ensureParticipants(
                                    current.participants,
                                    current.fullName,
                                    event.target.value,
                                    selectedEvent?.startsAtUtc,
                                  ).some((participant) => participant.isChild),
                              }))
                            }
                            required
                          />
                        </label>
                      </div>

                      {form.participants.length > 1 ? (
                        <div className="participant-list extra-participant-list">
                          {form.participants.slice(1).map((participant, index) => {
                            const participantIndex = index + 1;

                            return (
                              <article className="participant-card" key={`participant-${participantIndex}`}>
                                <div className="participant-card-header">
                                  <strong>Участник {participantIndex + 1}</strong>
                                  <button
                                    className="text-button"
                                    type="button"
                                    onClick={() => updateParticipants((items) => items.filter((_, currentIndex) => currentIndex !== participantIndex))}
                                  >
                                    Удалить
                                  </button>
                                </div>

                                <div className="modal-form-grid extra-participant-grid">
                                  <label>
                                    <span>ФИО</span>
                                    <input
                                      value={participant.fullName}
                                      onChange={(event) => {
                                        const fullName = event.target.value;
                                        updateParticipants((items) =>
                                          items.map((item, currentIndex) =>
                                            currentIndex === participantIndex ? { ...item, fullName } : item,
                                          ),
                                        );
                                      }}
                                      required
                                    />
                                  </label>

                                  <label>
                                    <span>Телефон</span>
                                    <input
                                      value={participant.phoneNumber ?? ''}
                                      inputMode="tel"
                                      placeholder="+7"
                                      onChange={(event) => {
                                        const phoneNumber = event.target.value;
                                        updateParticipants((items) =>
                                          items.map((item, currentIndex) =>
                                            currentIndex === participantIndex ? { ...item, phoneNumber } : item,
                                          ),
                                        );
                                      }}
                                      required
                                    />
                                  </label>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : null}

                      {canAddParticipant ? (
                        <button
                          className="button button-secondary compact-button"
                          type="button"
                          onClick={() => updateParticipants((items) => [...items, { ...EMPTY_PARTICIPANT }])}
                        >
                          Добавить участника
                        </button>
                      ) : null}
                    </div>
                  </section>

                  <section className="modal-section-grid">
                    <div className="modal-subpanel">
                      <h4>Экстренная связь</h4>

                      <div className="modal-form-grid emergency-grid">
                        <label>
                          <span>ФИО доверенного лица</span>
                          <input
                            value={form.emergencyContactName}
                            onChange={(event) => setForm((current) => ({ ...current, emergencyContactName: event.target.value }))}
                          />
                        </label>

                        <label>
                          <span>Телефон доверенного лица</span>
                          <input
                            value={form.emergencyContactPhone}
                            inputMode="tel"
                            placeholder="+7"
                            onChange={(event) => setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="modal-subpanel">
                      <h4>Дополнительно</h4>

                      <fieldset className="car-choice-group">
                        <legend>Наличие автомобиля</legend>
                        <label className={`radio-card${form.hasCar ? ' active' : ''}`}>
                          <input
                            type="radio"
                            name="hasCar"
                            checked={form.hasCar}
                            onChange={() => setForm((current) => ({ ...current, hasCar: true }))}
                          />
                          <span>Есть</span>
                        </label>
                        <label className={`radio-card${!form.hasCar ? ' active' : ''}`}>
                          <input
                            type="radio"
                            name="hasCar"
                            checked={!form.hasCar}
                            onChange={() => setForm((current) => ({ ...current, hasCar: false }))}
                          />
                          <span>Нет</span>
                        </label>
                      </fieldset>

                      <div className="modal-form-grid additional-grid">
                        <label>
                          <span className="label-with-help">
                            Здоровье и ограничения
                            {renderHelpButton('health', 'Укажи ограничения по здоровью, нагрузкам, сну или лекарствам. Это поможет команде бережно учитывать программу лагеря.', 'Открыть подсказку про здоровье и ограничения')}
                          </span>
                          <textarea
                            aria-label="Здоровье и ограничения"
                            rows={3}
                            value={form.healthNotes}
                            onChange={(event) => setForm((current) => ({ ...current, healthNotes: event.target.value }))}
                          />
                        </label>

                        <label>
                          <span className="label-with-help">
                            Аллергии
                            {renderHelpButton('allergy', 'Напиши пищевые аллергии, непереносимости и продукты, которые нельзя. Это важно для планирования питания.', 'Открыть подсказку про аллергии')}
                          </span>
                          <textarea
                            aria-label="Аллергии"
                            rows={3}
                            value={form.allergyNotes}
                            onChange={(event) => setForm((current) => ({ ...current, allergyNotes: event.target.value }))}
                          />
                        </label>

                        <label className="wide-field">
                          <span className="label-with-help">
                            Пожелания
                            {renderHelpButton('wishes', 'Здесь можно оставить важный комментарий: пожелания по участию, особые условия, дорога или вопросы к организаторам.', 'Открыть подсказку про пожелания')}
                          </span>
                          <textarea
                            aria-label="Пожелания"
                            rows={3}
                            value={form.motivation}
                            onChange={(event) => setForm((current) => ({ ...current, motivation: event.target.value }))}
                          />
                        </label>
                      </div>
                    </div>
                  </section>

                  <section className="modal-panel">
                    <label className="checkbox-row consent-row">
                      <input
                        type="checkbox"
                        checked={form.consentAccepted}
                        onChange={(event) => setForm((current) => ({ ...current, consentAccepted: event.target.checked }))}
                      />
                      <span>Подтверждаю корректность данных и согласие на обработку анкеты.</span>
                    </label>

                    {formError ? <p className="form-error">{formError}</p> : null}

                    <div className="modal-action-row">
                      <button className="button button-primary" type="submit" disabled={isSaving || !selectedEvent.isRegistrationOpen}>
                        {isSaving ? 'Отправляем...' : selectedEvent.isRegistrationOpen ? 'Отправить заявку' : 'Регистрация закрыта'}
                      </button>
                    </div>
                  </section>
                </>
              ) : (
                <div className="modal-state-card">
                  <strong>Нет опубликованного мероприятия</strong>
                  <p>Форма появится после открытия сезона.</p>
                </div>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
