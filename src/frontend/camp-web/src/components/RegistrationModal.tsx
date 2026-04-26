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
  isChild: boolean;
};

const EMPTY_PARTICIPANT: EditableParticipant = {
  fullName: '',
  isChild: false,
};
const DEFAULT_CITY = 'Новосибирск';
const DEFAULT_CHURCH_NAME = 'Благодать';

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
    accommodationPreference: 'Either',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: true,
  };
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
      accommodationPreference: parsed.accommodationPreference ?? 'Either',
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

function ensureParticipants(participants: EditableParticipant[], fallbackFullName = '') {
  const sanitized = participants
    .map((participant) => ({
      fullName: participant.fullName.trim(),
      isChild: participant.isChild,
    }))
    .filter((participant) => participant.fullName);

  if (sanitized.length > 0) {
    return sanitized;
  }

  return fallbackFullName.trim()
    ? [
        {
          fullName: fallbackFullName.trim(),
          isChild: false,
        },
      ]
    : [];
}

function buildSubmitPayload(form: SaveRegistrationRequest): SaveRegistrationRequest {
  const participants = ensureParticipants(form.participants, form.fullName);

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
    healthNotes: form.healthNotes?.trim() ?? '',
    allergyNotes: form.allergyNotes?.trim() ?? '',
    specialNeeds: form.specialNeeds?.trim() ?? '',
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
  }

  if (!form.phoneNumber.trim()) {
    errors.push('Укажите телефон участника.');
  } else if (!isValidPhone(form.phoneNumber)) {
    errors.push('Проверьте телефон участника.');
  }

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
  const validationSummaryRef = useRef<HTMLDivElement | null>(null);

  const draftStorageKey = useMemo(() => getDraftStorageKey(selectedEvent?.slug ?? selectedEventSlug), [selectedEvent?.slug, selectedEventSlug]);
  const availablePriceOptions = useMemo(
    () => selectedEvent?.priceOptions.filter((option) => option.isActive) ?? [],
    [selectedEvent?.priceOptions],
  );
  const participantsCount = form.participants.filter((participant) => participant.fullName.trim()).length || 1;
  const childrenCount = form.participants.filter((participant) => participant.fullName.trim() && participant.isChild).length;
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

  function updateParticipants(updater: (participants: EditableParticipant[]) => EditableParticipant[]) {
    setForm((current) => {
      const nextParticipants = updater(current.participants);
      const normalizedParticipants = nextParticipants.length ? nextParticipants : [{ ...EMPTY_PARTICIPANT }];
      return {
        ...current,
        participants: normalizedParticipants,
        fullName: normalizedParticipants[0]?.fullName ?? '',
        hasChildren: current.hasChildren || normalizedParticipants.some((participant) => participant.isChild),
      };
    });
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
      const saved = await submitGuestEventRegistration(selectedEvent.slug, buildSubmitPayload(form));
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
              <strong>{selectedEvent.title}</strong>
              <div className="modal-summary-list">
                <span>{formatDateRangeCompact(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</span>
                <span>{selectedEvent.location || 'Локация уточняется'}</span>
                <span>{selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'} мест</span>
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
                        <strong>{formatDateRangeCompact(selectedEvent.startsAtUtc, selectedEvent.endsAtUtc)}</strong>
                      </article>
                      <article>
                        <span>Локация</span>
                        <strong>{selectedEvent.location || 'Уточняется'}</strong>
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
                              <input
                                type="radio"
                                name="priceOption"
                                value={option.id}
                                checked={isSelected}
                                onChange={() => setForm((current) => ({ ...current, selectedPriceOptionId: option.id }))}
                              />
                              <span>{option.title}</span>
                              <strong>{formatMoney(option.amount, option.currency)}</strong>
                              <em>{option.description || (isAvailable ? 'Доступен для выбора' : 'Сейчас недоступен')}</em>
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

                  <section className="modal-section-grid">
                    <div className="modal-subpanel">
                      <h4>Контакты</h4>

                      <div className="modal-form-grid">
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
                          <span>Дата рождения основного участника</span>
                          <input
                            type="date"
                            value={form.birthDate}
                            onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                            required
                          />
                        </label>

                      </div>
                    </div>

                    <div className="modal-subpanel">
                      <h4>Состав заявки</h4>

                      <div className="participant-summary-row">
                        <span className="summary-chip">Участников: {participantsCount}</span>
                        <span className="summary-chip">Детей: {childrenCount}</span>
                      </div>

                      <div className="participant-list">
                        {form.participants.map((participant, index) => (
                          <article className="participant-card" key={`participant-${index}`}>
                            <div className="participant-card-header">
                              <strong>{index === 0 ? 'Основной участник' : `Участник ${index + 1}`}</strong>
                              {form.participants.length > 1 ? (
                                <button
                                  className="text-button"
                                  type="button"
                                  onClick={() => updateParticipants((items) => items.filter((_, currentIndex) => currentIndex !== index))}
                                >
                                  Удалить
                                </button>
                              ) : null}
                            </div>

                            <div className="modal-form-grid participant-grid">
                              <label>
                                <span>ФИО</span>
                                <input
                                  value={participant.fullName}
                                  onChange={(event) => {
                                    const fullName = event.target.value;
                                    updateParticipants((items) =>
                                      items.map((item, currentIndex) =>
                                        currentIndex === index
                                          ? {
                                              ...item,
                                              fullName,
                                            }
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
                                          ? {
                                              ...item,
                                              isChild: event.target.checked,
                                            }
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

                      <button className="button button-secondary compact-button" type="button" onClick={() => updateParticipants((items) => [...items, { ...EMPTY_PARTICIPANT }])}>
                        Добавить участника
                      </button>
                    </div>
                  </section>

                  <section className="modal-section-grid">
                    <div className="modal-subpanel">
                      <h4>Размещение и экстренная связь</h4>

                      <div className="modal-form-grid">
                        <label>
                          <span>Размещение</span>
                          <select
                            value={form.accommodationPreference}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                accommodationPreference: event.target.value as AccommodationPreference,
                              }))
                            }
                          >
                            <option value="Either">Любой формат</option>
                            <option value="Tent">Палатка</option>
                            <option value="Cabin">Домик</option>
                          </select>
                        </label>

                        <label>
                          <span>Доверенное лицо</span>
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
                            checked={form.hasChildren}
                            onChange={(event) => setForm((current) => ({ ...current, hasChildren: event.target.checked }))}
                          />
                          <span>Еду с детьми</span>
                        </label>
                      </div>
                    </div>

                    <div className="modal-subpanel">
                      <h4>Дополнительно</h4>

                      <div className="modal-form-grid">
                        <label>
                          <span>Здоровье и ограничения</span>
                          <textarea
                            rows={3}
                            value={form.healthNotes}
                            onChange={(event) => setForm((current) => ({ ...current, healthNotes: event.target.value }))}
                          />
                        </label>

                        <label>
                          <span>Аллергии</span>
                          <textarea
                            rows={3}
                            value={form.allergyNotes}
                            onChange={(event) => setForm((current) => ({ ...current, allergyNotes: event.target.value }))}
                          />
                        </label>

                        <label>
                          <span>Особые условия</span>
                          <textarea
                            rows={3}
                            value={form.specialNeeds}
                            onChange={(event) => setForm((current) => ({ ...current, specialNeeds: event.target.value }))}
                          />
                        </label>

                        <label>
                          <span>Комментарий</span>
                          <textarea
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
