import { useEffect, useState, type FormEvent } from 'react';
import {
  createAdminEvent,
  getAdminEventDetails,
  getAdminEvents,
  updateAdminEvent,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import type {
  AdminEventDetails,
  AdminEventSummary,
  EventContentBlockType,
  EventEditionStatus,
  EventKind,
  EventScheduleItemKind,
  UpsertAdminEventContentBlockRequest,
  UpsertAdminEventPriceOptionRequest,
  UpsertAdminEventRequest,
  UpsertAdminEventScheduleItemRequest,
} from '../types';

type AdminEventsSectionProps = {
  accessToken: string | null;
  isActive: boolean;
};

type EventEditorTab = 'main' | 'dates' | 'pricing' | 'schedule' | 'content';

const eventEditorTabs: Array<{ id: EventEditorTab; label: string; description: string }> = [
  {
    id: 'main',
    label: '\u041e\u0441\u043d\u043e\u0432\u043d\u043e\u0435',
    description: '\u0421\u0435\u0440\u0438\u044f, \u0432\u044b\u043f\u0443\u0441\u043a \u0438 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435',
  },
  {
    id: 'dates',
    label: '\u0414\u0430\u0442\u044b',
    description: '\u041e\u043a\u043d\u043e \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0438 \u0441\u0440\u043e\u043a\u0438',
  },
  {
    id: 'pricing',
    label: '\u0422\u0430\u0440\u0438\u0444\u044b',
    description: '\u0426\u0435\u043d\u044b, \u043a\u0432\u043e\u0442\u044b \u0438 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b',
  },
  {
    id: 'schedule',
    label: '\u0420\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435',
    description: '\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0434\u0430\u0442\u044b \u0438 \u044d\u0442\u0430\u043f\u044b',
  },
  {
    id: 'content',
    label: '\u041a\u043e\u043d\u0442\u0435\u043d\u0442',
    description: '\u0411\u043b\u043e\u043a\u0438 \u0434\u043b\u044f \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b \u0441\u043e\u0431\u044b\u0442\u0438\u044f',
  },
];

const eventKindLabels: Record<EventKind, string> = {
  Camp: '\u041b\u0430\u0433\u0435\u0440\u044c',
  Conference: '\u041a\u043e\u043d\u0444\u0435\u0440\u0435\u043d\u0446\u0438\u044f',
  Retreat: '\u0420\u0435\u0442\u0440\u0438\u0442',
  Trip: '\u041f\u043e\u0435\u0437\u0434\u043a\u0430',
  Other: '\u0414\u0440\u0443\u0433\u043e\u0435',
};

const eventStatusLabels: Record<EventEditionStatus, string> = {
  Draft: '\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a',
  Published: '\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e',
  RegistrationOpen: '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u043e\u0442\u043a\u0440\u044b\u0442\u0430',
  RegistrationClosed: '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f \u0437\u0430\u043a\u0440\u044b\u0442\u0430',
  InProgress: '\u0418\u0434\u0451\u0442 \u0441\u0435\u0439\u0447\u0430\u0441',
  Completed: '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e',
  Archived: '\u0410\u0440\u0445\u0438\u0432',
};

const scheduleKindLabels: Record<EventScheduleItemKind, string> = {
  Arrival: '\u0417\u0430\u0435\u0437\u0434',
  MainProgram: '\u041e\u0441\u043d\u043e\u0432\u043d\u0430\u044f \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430',
  Departure: '\u0412\u044b\u0435\u0437\u0434',
  Meeting: '\u0412\u0441\u0442\u0440\u0435\u0447\u0430',
  Deadline: '\u0414\u0435\u0434\u043b\u0430\u0439\u043d',
  Other: '\u0414\u0440\u0443\u0433\u043e\u0435',
};

const contentBlockLabels: Record<EventContentBlockType, string> = {
  Hero: '\u0413\u043b\u0430\u0432\u043d\u044b\u0439 \u0431\u043b\u043e\u043a',
  About: '\u041e \u043c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u0438',
  Highlight: '\u0410\u043a\u0446\u0435\u043d\u0442\u044b',
  WhatToBring: '\u0427\u0442\u043e \u0432\u0437\u044f\u0442\u044c',
  Program: '\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430',
  ImportantNotice: '\u0412\u0430\u0436\u043d\u043e\u0435',
  Faq: '\u0412\u043e\u043f\u0440\u043e\u0441\u044b \u0438 \u043e\u0442\u0432\u0435\u0442\u044b',
};

function formatEventKind(kind: EventKind) {
  return eventKindLabels[kind] ?? kind;
}

function formatEventStatus(status: EventEditionStatus) {
  return eventStatusLabels[status] ?? status;
}

function formatScheduleKind(kind: EventScheduleItemKind) {
  return scheduleKindLabels[kind] ?? kind;
}

function formatContentBlockType(type: EventContentBlockType) {
  return contentBlockLabels[type] ?? type;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '\u041f\u043e\u043a\u0430 \u043d\u0435 \u0437\u0430\u0434\u0430\u043d\u043e';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toDateTimeLocalInput(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function createEmptyPriceOption(sortOrder = 0): UpsertAdminEventPriceOptionRequest {
  return {
    code: `price-${sortOrder + 1}`,
    title: '',
    description: '',
    amount: 0,
    currency: 'RUB',
    salesStartsAtUtc: null,
    salesEndsAtUtc: null,
    capacity: null,
    isDefault: sortOrder === 0,
    isActive: true,
    sortOrder,
  };
}

function createEmptyScheduleItem(sortOrder = 0): UpsertAdminEventScheduleItemRequest {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    title: '',
    kind: sortOrder === 0 ? 'Arrival' : 'MainProgram',
    startsAtUtc: startsAt.toISOString(),
    endsAtUtc: endsAt.toISOString(),
    location: '',
    notes: '',
    sortOrder,
  };
}

function createEmptyContentBlock(sortOrder = 0): UpsertAdminEventContentBlockRequest {
  return {
    blockType: sortOrder === 0 ? 'Hero' : 'About',
    title: '',
    body: '',
    isPublished: true,
    sortOrder,
  };
}

function createEmptyEventDraft(): UpsertAdminEventRequest {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 3 * 24 * 60 * 60 * 1000);

  return {
    seriesSlug: '',
    seriesTitle: '',
    kind: 'Camp',
    seriesIsActive: true,
    slug: '',
    title: '',
    seasonLabel: '',
    shortDescription: '',
    fullDescription: '',
    location: '',
    timezone: 'Asia/Novosibirsk',
    status: 'Draft',
    startsAtUtc: startsAt.toISOString(),
    endsAtUtc: endsAt.toISOString(),
    registrationOpensAtUtc: null,
    registrationClosesAtUtc: null,
    capacity: null,
    waitlistEnabled: true,
    sortOrder: 0,
    priceOptions: [createEmptyPriceOption(0)],
    scheduleItems: [createEmptyScheduleItem(0)],
    contentBlocks: [createEmptyContentBlock(0)],
  };
}

function createDraftFromEvent(eventItem: AdminEventDetails): UpsertAdminEventRequest {
  return {
    seriesSlug: eventItem.seriesSlug,
    seriesTitle: eventItem.seriesTitle,
    kind: eventItem.kind,
    seriesIsActive: eventItem.seriesIsActive,
    slug: eventItem.slug,
    title: eventItem.title,
    seasonLabel: eventItem.seasonLabel ?? '',
    shortDescription: eventItem.shortDescription,
    fullDescription: eventItem.fullDescription ?? '',
    location: eventItem.location ?? '',
    timezone: eventItem.timezone,
    status: eventItem.status,
    startsAtUtc: eventItem.startsAtUtc,
    endsAtUtc: eventItem.endsAtUtc,
    registrationOpensAtUtc: eventItem.registrationOpensAtUtc ?? null,
    registrationClosesAtUtc: eventItem.registrationClosesAtUtc ?? null,
    capacity: eventItem.capacity ?? null,
    waitlistEnabled: eventItem.waitlistEnabled,
    sortOrder: eventItem.sortOrder,
    priceOptions: eventItem.priceOptions.map((item) => ({
      code: item.code,
      title: item.title,
      description: item.description ?? '',
      amount: item.amount,
      currency: item.currency,
      salesStartsAtUtc: item.salesStartsAtUtc ?? null,
      salesEndsAtUtc: item.salesEndsAtUtc ?? null,
      capacity: item.capacity ?? null,
      isDefault: item.isDefault,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    })),
    scheduleItems: eventItem.scheduleItems.map((item) => ({
      title: item.title,
      kind: item.kind,
      startsAtUtc: item.startsAtUtc,
      endsAtUtc: item.endsAtUtc ?? null,
      location: item.location ?? '',
      notes: item.notes ?? '',
      sortOrder: item.sortOrder,
    })),
    contentBlocks: eventItem.contentBlocks.map((item) => ({
      blockType: item.blockType,
      title: item.title ?? '',
      body: item.body,
      isPublished: item.isPublished,
      sortOrder: item.sortOrder,
    })),
  };
}

export function AdminEventsSection({ accessToken, isActive }: AdminEventsSectionProps) {
  const toast = useToast();
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('new');
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [draft, setDraft] = useState<UpsertAdminEventRequest>(() => createEmptyEventDraft());
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EventEditorTab>('main');

  const selectedSummary = currentEventId ? events.find((item) => item.id === currentEventId) ?? null : null;
  const isCreateMode = selectedEventId === 'new' || !currentEventId;

  useEffect(() => {
    if (!isActive || !accessToken) {
      return;
    }

    void loadEvents();
  }, [accessToken, isActive]);

  useEffect(() => {
    if (!isActive || !accessToken) {
      return;
    }

    if (selectedEventId === 'new') {
      setCurrentEventId(null);
      setDraft(createEmptyEventDraft());
      setActiveTab('main');
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      setIsDetailsLoading(true);
      setError(null);

      try {
        const loaded = await getAdminEventDetails(accessToken, selectedEventId);
        if (cancelled) {
          return;
        }

        setCurrentEventId(loaded.id);
        setDraft(createDraftFromEvent(loaded));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const nextError = loadError instanceof Error ? loadError.message : 'Не удалось открыть карточку мероприятия.';
        setError(nextError);
        toast.error('Не удалось загрузить мероприятие', nextError);
      } finally {
        if (!cancelled) {
          setIsDetailsLoading(false);
        }
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isActive, selectedEventId, toast]);

  async function loadEvents(preferredEventId?: string) {
    if (!accessToken) {
      return;
    }

    setIsListLoading(true);
    setError(null);

    try {
      const response = await getAdminEvents(accessToken);
      setEvents(response.events);
      setSelectedEventId((current) => {
        const nextId = preferredEventId ?? current;
        if (nextId === 'new') {
          return 'new';
        }

        if (nextId && response.events.some((item) => item.id === nextId)) {
          return nextId;
        }

        return response.events[0]?.id ?? 'new';
      });
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось получить список мероприятий.';
      setError(nextError);
      toast.error('Не удалось загрузить мероприятия', nextError);
    } finally {
      setIsListLoading(false);
    }
  }

  function updateDraft(patch: Partial<UpsertAdminEventRequest>) {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  }

  function updatePrice(index: number, patch: Partial<UpsertAdminEventPriceOptionRequest>) {
    setDraft((current) => ({
      ...current,
      priceOptions: current.priceOptions.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return patch.isDefault ? { ...item, isDefault: false } : item;
        }

        return {
          ...item,
          ...patch,
        };
      }),
    }));
  }

  function updateSchedule(index: number, patch: Partial<UpsertAdminEventScheduleItemRequest>) {
    setDraft((current) => ({
      ...current,
      scheduleItems: current.scheduleItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    }));
  }

  function updateBlock(index: number, patch: Partial<UpsertAdminEventContentBlockRequest>) {
    setDraft((current) => ({
      ...current,
      contentBlocks: current.contentBlocks.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    }));
  }

  function removePrice(index: number) {
    setDraft((current) => ({
      ...current,
      priceOptions: current.priceOptions
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  }

  function removeSchedule(index: number) {
    setDraft((current) => ({
      ...current,
      scheduleItems: current.scheduleItems
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  }

  function removeBlock(index: number) {
    setDraft((current) => ({
      ...current,
      contentBlocks: current.contentBlocks
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  }

  function startNewEvent() {
    setSelectedEventId('new');
    setCurrentEventId(null);
    setDraft(createEmptyEventDraft());
    setActiveTab('main');
    setMessage(null);
    setError(null);
  }

  function normalizeDraft(source: UpsertAdminEventRequest): UpsertAdminEventRequest {
    return {
      ...source,
      seriesSlug: source.seriesSlug.trim(),
      seriesTitle: source.seriesTitle.trim(),
      slug: source.slug.trim(),
      title: source.title.trim(),
      seasonLabel: source.seasonLabel?.trim() || '',
      shortDescription: source.shortDescription.trim(),
      fullDescription: source.fullDescription?.trim() || '',
      location: source.location?.trim() || '',
      timezone: source.timezone.trim() || 'Asia/Novosibirsk',
      registrationOpensAtUtc: source.registrationOpensAtUtc || null,
      registrationClosesAtUtc: source.registrationClosesAtUtc || null,
      capacity: source.capacity ?? null,
      priceOptions: source.priceOptions.map((item, index) => ({
        ...item,
        code: item.code.trim(),
        title: item.title.trim(),
        description: item.description?.trim() || '',
        currency: item.currency.trim().toUpperCase() || 'RUB',
        salesStartsAtUtc: item.salesStartsAtUtc || null,
        salesEndsAtUtc: item.salesEndsAtUtc || null,
        capacity: item.capacity ?? null,
        sortOrder: item.sortOrder ?? index,
      })),
      scheduleItems: source.scheduleItems.map((item, index) => ({
        ...item,
        title: item.title.trim(),
        location: item.location?.trim() || '',
        notes: item.notes?.trim() || '',
        endsAtUtc: item.endsAtUtc || null,
        sortOrder: item.sortOrder ?? index,
      })),
      contentBlocks: source.contentBlocks.map((item, index) => ({
        ...item,
        title: item.title?.trim() || '',
        body: item.body.trim(),
        sortOrder: item.sortOrder ?? index,
      })),
    };
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) {
      return;
    }

    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      const payload = normalizeDraft(draft);
      const saved = isCreateMode
        ? await createAdminEvent(accessToken, payload)
        : await updateAdminEvent(accessToken, currentEventId, payload);

      setCurrentEventId(saved.id);
      setSelectedEventId(saved.id);
      setDraft(createDraftFromEvent(saved));
      await loadEvents(saved.id);

      const successMessage = isCreateMode
        ? `Мероприятие «${saved.title}» создано.`
        : `Изменения в «${saved.title}» сохранены.`;
      setMessage(successMessage);
      toast.success(isCreateMode ? 'Мероприятие создано' : 'Мероприятие сохранено', successMessage);
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить мероприятие.';
      setError(nextError);
      toast.error('Не удалось сохранить мероприятие', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="event-admin-layout" hidden={!isActive}>
      <aside className="glass-card stack-form event-list-column">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Мероприятия</p>
            <h3>Сезоны и события</h3>
          </div>
          <button className="secondary-button" type="button" onClick={startNewEvent}>
            Новое
          </button>
        </div>

        <p className="form-muted">
          Здесь можно завести лагерь на следующий год, отдельный ретрит или любое другое мероприятие со своей регистрацией.
        </p>

        <div className="role-pills">
          <span className="role-pill">Всего: {events.length}</span>
          <span className="role-pill muted-pill">{isListLoading ? 'Обновляем...' : 'Список готов'}</span>
        </div>

        <div className="event-list-stack">
          <button
            className={`event-list-card${selectedEventId === 'new' ? ' active' : ''}`}
            type="button"
            onClick={startNewEvent}
          >
            <p className="mini-eyebrow">Черновик</p>
            <h3>Новое мероприятие</h3>
            <p>Создать новый выпуск, цены, даты и текстовые блоки.</p>
          </button>

          {events.map((eventItem) => (
            <button
              className={`event-list-card${selectedEventId === eventItem.id ? ' active' : ''}`}
              type="button"
              key={eventItem.id}
              onClick={() => {
                setMessage(null);
                setError(null);
                setActiveTab('main');
                setSelectedEventId(eventItem.id);
              }}
            >
              <div className="event-list-card-head">
                <p className="mini-eyebrow">{formatEventKind(eventItem.kind)}</p>
                <span className="role-pill">{formatEventStatus(eventItem.status)}</span>
              </div>
              <h3>{eventItem.title}</h3>
              <p>{eventItem.seasonLabel || eventItem.seriesTitle}</p>
              <p>{formatDateTime(eventItem.startsAtUtc)}</p>
              <div className="role-pills">
                <span className="role-pill">Заявок: {eventItem.registrationsCount}</span>
                <span className="role-pill muted-pill">
                  {eventItem.remainingCapacity == null ? 'Без лимита' : `Осталось: ${eventItem.remainingCapacity}`}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <form className="glass-card stack-form event-detail-column" onSubmit={handleSave}>
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">{isCreateMode ? 'Новый выпуск' : 'Редактор'}</p>
            <h3>{isCreateMode ? 'Карточка мероприятия' : draft.title || 'Карточка мероприятия'}</h3>
          </div>
          <button className="primary-button" type="submit" disabled={isSaving || isDetailsLoading}>
            {isSaving ? 'Сохраняем...' : isCreateMode ? 'Создать' : 'Сохранить'}
          </button>
        </div>

        {selectedSummary ? (
          <div className="role-pills">
            <span className="role-pill">Всего заявок: {selectedSummary.registrationsCount}</span>
            <span className="role-pill">Отправлено: {selectedSummary.submittedRegistrations}</span>
            <span className="role-pill">Подтверждено: {selectedSummary.confirmedRegistrations}</span>
            <span className="role-pill muted-pill">
              {selectedSummary.registrationClosesAtUtc
                ? `Регистрация до ${formatDateTime(selectedSummary.registrationClosesAtUtc)}`
                : 'Без дедлайна'}
            </span>
          </div>
        ) : null}

        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {isDetailsLoading ? <p className="form-muted">Загружаем полную карточку...</p> : null}

        <div className="event-tab-strip" role="tablist" aria-label="Разделы редактора мероприятия">
          {eventEditorTabs.map((tab) => (
            <button
              className={`event-tab-button${activeTab === tab.id ? ' active' : ''}`}
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <strong>{tab.label}</strong>
              <span>{tab.description}</span>
            </button>
          ))}
        </div>

        <section className="event-subsection" hidden={activeTab !== 'main'}>
          <div className="event-subsection-head">
            <div>
              <p className="mini-eyebrow">Основное</p>
              <h3>Серия, выпуск и публикация</h3>
            </div>
          </div>

          <div className="event-editor-grid">
            <label>
              <span>Название серии</span>
              <input value={draft.seriesTitle} onChange={(event) => updateDraft({ seriesTitle: event.target.value })} required />
            </label>

            <label>
              <span>Slug серии</span>
              <input value={draft.seriesSlug} onChange={(event) => updateDraft({ seriesSlug: event.target.value })} required />
            </label>

            <label>
              <span>Название выпуска</span>
              <input value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required />
            </label>

            <label>
              <span>Slug выпуска</span>
              <input value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} required />
            </label>

            <label>
              <span>Тип</span>
              <select value={draft.kind} onChange={(event) => updateDraft({ kind: event.target.value as EventKind })}>
                {Object.keys(eventKindLabels).map((kind) => (
                  <option value={kind} key={kind}>
                    {formatEventKind(kind as EventKind)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Статус</span>
              <select value={draft.status} onChange={(event) => updateDraft({ status: event.target.value as EventEditionStatus })}>
                {Object.keys(eventStatusLabels).map((status) => (
                  <option value={status} key={status}>
                    {formatEventStatus(status as EventEditionStatus)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Сезонная подпись</span>
              <input value={draft.seasonLabel ?? ''} onChange={(event) => updateDraft({ seasonLabel: event.target.value })} />
            </label>

            <label>
              <span>Часовой пояс</span>
              <input value={draft.timezone} onChange={(event) => updateDraft({ timezone: event.target.value })} required />
            </label>

            <label>
              <span>Локация</span>
              <input value={draft.location ?? ''} onChange={(event) => updateDraft({ location: event.target.value })} />
            </label>

            <label>
              <span>Лимит участников</span>
              <input
                type="number"
                min={0}
                value={draft.capacity ?? ''}
                onChange={(event) => updateDraft({ capacity: event.target.value === '' ? null : Number(event.target.value) })}
              />
            </label>

            <label>
              <span>Порядок</span>
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => updateDraft({ sortOrder: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="event-toggle-row">
            <label className="role-toggle">
              <input
                type="checkbox"
                checked={draft.seriesIsActive}
                onChange={(event) => updateDraft({ seriesIsActive: event.target.checked })}
              />
              <div>
                <strong>Серия активна</strong>
                <span>Можно использовать в каталоге и новых выпусках.</span>
              </div>
            </label>

            <label className="role-toggle">
              <input
                type="checkbox"
                checked={draft.waitlistEnabled}
                onChange={(event) => updateDraft({ waitlistEnabled: event.target.checked })}
              />
              <div>
                <strong>Лист ожидания</strong>
                <span>Разрешить регистрацию после заполнения лимита.</span>
              </div>
            </label>
          </div>

          <label>
            <span>Короткое описание</span>
            <textarea rows={3} value={draft.shortDescription} onChange={(event) => updateDraft({ shortDescription: event.target.value })} required />
          </label>

          <label>
            <span>Подробное описание</span>
            <textarea rows={6} value={draft.fullDescription ?? ''} onChange={(event) => updateDraft({ fullDescription: event.target.value })} />
          </label>
        </section>

        <section className="event-subsection" hidden={activeTab !== 'dates'}>
          <div className="event-subsection-head">
            <div>
              <p className="mini-eyebrow">Даты</p>
              <h3>Проведение и окно регистрации</h3>
            </div>
          </div>

          <div className="event-editor-grid">
            <label>
              <span>Старт</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalInput(draft.startsAtUtc)}
                onChange={(event) => updateDraft({ startsAtUtc: fromDateTimeLocalInput(event.target.value) ?? draft.startsAtUtc })}
                required
              />
            </label>

            <label>
              <span>Завершение</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalInput(draft.endsAtUtc)}
                onChange={(event) => updateDraft({ endsAtUtc: fromDateTimeLocalInput(event.target.value) ?? draft.endsAtUtc })}
                required
              />
            </label>

            <label>
              <span>Открытие регистрации</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalInput(draft.registrationOpensAtUtc)}
                onChange={(event) => updateDraft({ registrationOpensAtUtc: fromDateTimeLocalInput(event.target.value) })}
              />
            </label>

            <label>
              <span>Закрытие регистрации</span>
              <input
                type="datetime-local"
                value={toDateTimeLocalInput(draft.registrationClosesAtUtc)}
                onChange={(event) => updateDraft({ registrationClosesAtUtc: fromDateTimeLocalInput(event.target.value) })}
              />
            </label>
          </div>
        </section>

        <section className="event-subsection" hidden={activeTab !== 'pricing'}>
          <div className="event-subsection-head">
            <div>
              <p className="mini-eyebrow">Тарифы</p>
              <h3>Стоимость и квоты</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                priceOptions: [...current.priceOptions, createEmptyPriceOption(current.priceOptions.length)],
              }))}
            >
              Добавить тариф
            </button>
          </div>

          <div className="event-collection">
            {draft.priceOptions.map((item, index) => (
              <article className="event-collection-item" key={`${item.code}-${index}`}>
                <div className="event-subsection-head compact">
                  <div>
                    <strong>{item.title || `Тариф ${index + 1}`}</strong>
                    <p className="form-muted">{item.code || 'Код ещё не указан'}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => removePrice(index)} disabled={draft.priceOptions.length <= 1}>
                    Удалить
                  </button>
                </div>

                <div className="event-inline-grid">
                  <label>
                    <span>Код</span>
                    <input value={item.code} onChange={(event) => updatePrice(index, { code: event.target.value })} required />
                  </label>
                  <label>
                    <span>Название</span>
                    <input value={item.title} onChange={(event) => updatePrice(index, { title: event.target.value })} required />
                  </label>
                  <label>
                    <span>Сумма</span>
                    <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updatePrice(index, { amount: Number(event.target.value) })} />
                  </label>
                  <label>
                    <span>Валюта</span>
                    <input value={item.currency} onChange={(event) => updatePrice(index, { currency: event.target.value })} required />
                  </label>
                  <label>
                    <span>Квота</span>
                    <input
                      type="number"
                      min={0}
                      value={item.capacity ?? ''}
                      onChange={(event) => updatePrice(index, { capacity: event.target.value === '' ? null : Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Порядок</span>
                    <input type="number" value={item.sortOrder} onChange={(event) => updatePrice(index, { sortOrder: Number(event.target.value) })} />
                  </label>
                  <label>
                    <span>Продажи с</span>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(item.salesStartsAtUtc)}
                      onChange={(event) => updatePrice(index, { salesStartsAtUtc: fromDateTimeLocalInput(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Продажи до</span>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(item.salesEndsAtUtc)}
                      onChange={(event) => updatePrice(index, { salesEndsAtUtc: fromDateTimeLocalInput(event.target.value) })}
                    />
                  </label>
                </div>

                <label>
                  <span>Описание</span>
                  <textarea rows={3} value={item.description ?? ''} onChange={(event) => updatePrice(index, { description: event.target.value })} />
                </label>

                <div className="event-toggle-row">
                  <label className="role-toggle">
                    <input type="checkbox" checked={item.isDefault} onChange={(event) => updatePrice(index, { isDefault: event.target.checked })} />
                    <div>
                      <strong>По умолчанию</strong>
                      <span>Этот тариф будет выбран первым.</span>
                    </div>
                  </label>
                  <label className="role-toggle">
                    <input type="checkbox" checked={item.isActive} onChange={(event) => updatePrice(index, { isActive: event.target.checked })} />
                    <div>
                      <strong>Тариф активен</strong>
                      <span>Доступен пользователю в форме регистрации.</span>
                    </div>
                  </label>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="event-subsection" hidden={activeTab !== 'schedule'}>
          <div className="event-subsection-head">
            <div>
              <p className="mini-eyebrow">Расписание</p>
              <h3>Ключевые этапы</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                scheduleItems: [...current.scheduleItems, createEmptyScheduleItem(current.scheduleItems.length)],
              }))}
            >
              Добавить дату
            </button>
          </div>

          <div className="event-collection">
            {draft.scheduleItems.map((item, index) => (
              <article className="event-collection-item" key={`${item.title}-${index}`}>
                <div className="event-subsection-head compact">
                  <div>
                    <strong>{item.title || `Пункт ${index + 1}`}</strong>
                    <p className="form-muted">{formatScheduleKind(item.kind)}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => removeSchedule(index)}>
                    Удалить
                  </button>
                </div>

                <div className="event-inline-grid">
                  <label>
                    <span>Название</span>
                    <input value={item.title} onChange={(event) => updateSchedule(index, { title: event.target.value })} required />
                  </label>
                  <label>
                    <span>Тип</span>
                    <select value={item.kind} onChange={(event) => updateSchedule(index, { kind: event.target.value as EventScheduleItemKind })}>
                      {Object.keys(scheduleKindLabels).map((kind) => (
                        <option value={kind} key={kind}>
                          {formatScheduleKind(kind as EventScheduleItemKind)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Начало</span>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(item.startsAtUtc)}
                      onChange={(event) => updateSchedule(index, { startsAtUtc: fromDateTimeLocalInput(event.target.value) ?? item.startsAtUtc })}
                      required
                    />
                  </label>
                  <label>
                    <span>Конец</span>
                    <input
                      type="datetime-local"
                      value={toDateTimeLocalInput(item.endsAtUtc)}
                      onChange={(event) => updateSchedule(index, { endsAtUtc: fromDateTimeLocalInput(event.target.value) })}
                    />
                  </label>
                  <label>
                    <span>Локация</span>
                    <input value={item.location ?? ''} onChange={(event) => updateSchedule(index, { location: event.target.value })} />
                  </label>
                  <label>
                    <span>Порядок</span>
                    <input type="number" value={item.sortOrder} onChange={(event) => updateSchedule(index, { sortOrder: Number(event.target.value) })} />
                  </label>
                </div>

                <label>
                  <span>Примечание</span>
                  <textarea rows={3} value={item.notes ?? ''} onChange={(event) => updateSchedule(index, { notes: event.target.value })} />
                </label>
              </article>
            ))}
          </div>
        </section>

        <section className="event-subsection" hidden={activeTab !== 'content'}>
          <div className="event-subsection-head">
            <div>
              <p className="mini-eyebrow">Контент</p>
              <h3>Смысловые блоки страницы</h3>
            </div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                contentBlocks: [...current.contentBlocks, createEmptyContentBlock(current.contentBlocks.length)],
              }))}
            >
              Добавить блок
            </button>
          </div>

          <div className="event-collection">
            {draft.contentBlocks.map((item, index) => (
              <article className="event-collection-item" key={`${item.blockType}-${index}`}>
                <div className="event-subsection-head compact">
                  <div>
                    <strong>{item.title || formatContentBlockType(item.blockType)}</strong>
                    <p className="form-muted">{formatContentBlockType(item.blockType)}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => removeBlock(index)}>
                    Удалить
                  </button>
                </div>

                <div className="event-inline-grid">
                  <label>
                    <span>Тип блока</span>
                    <select value={item.blockType} onChange={(event) => updateBlock(index, { blockType: event.target.value as EventContentBlockType })}>
                      {Object.keys(contentBlockLabels).map((blockType) => (
                        <option value={blockType} key={blockType}>
                          {formatContentBlockType(blockType as EventContentBlockType)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Заголовок</span>
                    <input value={item.title ?? ''} onChange={(event) => updateBlock(index, { title: event.target.value })} />
                  </label>
                  <label>
                    <span>Порядок</span>
                    <input type="number" value={item.sortOrder} onChange={(event) => updateBlock(index, { sortOrder: Number(event.target.value) })} />
                  </label>
                </div>

                <label>
                  <span>Текст</span>
                  <textarea rows={5} value={item.body} onChange={(event) => updateBlock(index, { body: event.target.value })} required />
                </label>

                <label className="role-toggle">
                  <input type="checkbox" checked={item.isPublished} onChange={(event) => updateBlock(index, { isPublished: event.target.checked })} />
                  <div>
                    <strong>Опубликовано</strong>
                    <span>Неопубликованный блок останется в карточке как черновик.</span>
                  </div>
                </label>
              </article>
            ))}
          </div>
        </section>
      </form>
    </section>
  );
}
