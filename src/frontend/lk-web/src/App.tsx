import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { campBaseUrl } from './lib/config';
import {
  getAdminExternalAuthSettings,
  getAdminEvents,
  getAdminOverview,
  getAdminRegistrations,
  getAdminUsers,
  getExternalAuthStatus,
  getPublicExternalAuthProviders,
  getTelegramAuthStatus,
  loginWithTelegramWidget,
  startAdminExternalAuthProviderTest,
  startExternalAuth,
  startTelegramAuth,
  unlinkExternalIdentity,
  updateAdminExternalAuthProvider,
  updateAdminRegistrationStatus,
  updateUserRoles,
} from './lib/api';
import { AdminEventsSection } from './admin/AdminEventsSection';
import { AdminBackupsSection } from './admin/AdminBackupsSection';
import { AdminGallerySection } from './admin/AdminGallerySection';
import { AdminSiteSettingsSection } from './admin/AdminSiteSettingsSection';
import { AdminTelegramSection } from './admin/AdminTelegramSection';
import { CampRegistrationFlowPage } from './camp/CampRegistrationPage';
import { NotificationsPage } from './notifications/NotificationsPage';
import { useToast } from './ui/ToastProvider';
import { normalizePhone, PhoneVerificationPanel } from './ui/PhoneVerificationPanel';
import type {
  AccountRegistrationSummary,
  AccommodationPreference,
  AdminExternalAuthProvider,
  AdminExternalAuthSettings,
  AdminEventDetails,
  AdminEventSummary,
  AdminOverview,
  AdminRoleDefinition,
  AdminUser,
  AppRole,
  EventContentBlockType,
  EventEditionStatus,
  EventKind,
  EventScheduleItemKind,
  ExternalAuthStartResponse,
  ExternalIdentity,
  PaginatedResponse,
  PublicExternalAuthProvider,
  RegistrationStatus,
  UpsertAdminEventContentBlockRequest,
  UpsertAdminEventPriceOptionRequest,
  UpsertAdminEventRequest,
  UpsertAdminEventScheduleItemRequest,
  UpdateProfileRequest,
  UpdateExternalAuthProviderRequest,
} from './types';

const roleLabels: Record<AppRole, string> = {
  Member: '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a',
  CampManager: '\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u043e\u0440 \u043b\u0430\u0433\u0435\u0440\u044f',
  Admin: '\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440',
};

function hasRole(roles: string[] | undefined, role: AppRole) {
  return Boolean(roles?.includes(role));
}

function isAdmin(roles: string[] | undefined) {
  return hasRole(roles, 'Admin');
}

function orderRoles(roles: AppRole[]) {
  const sortOrder: Record<AppRole, number> = {
    Member: 0,
    CampManager: 1,
    Admin: 2,
  };

  return [...roles].sort((left, right) => sortOrder[left] - sortOrder[right]);
}

function formatRoleLabel(role: string) {
  return roleLabels[role as AppRole] ?? role;
}

function formatProviderLabel(provider: string) {
  switch (provider) {
    case 'google':
      return 'Google';
    case 'vk':
      return 'VK';
    case 'yandex':
      return 'Yandex';
    case 'telegram':
      return 'Telegram';
    default:
      return provider;
  }
}

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

const accommodationPreferenceLabels: Record<AccommodationPreference, string> = {
  Tent: '\u041f\u0430\u043b\u0430\u0442\u043a\u0430',
  Cabin: '\u0414\u043e\u043c\u0438\u043a',
  Either: '\u0411\u0435\u0437 \u0440\u0430\u0437\u043d\u0438\u0446\u044b',
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

function formatContentBlockType(blockType: EventContentBlockType) {
  return contentBlockLabels[blockType] ?? blockType;
}

function formatRoleList(roles: string[] | undefined) {
  if (!roles?.length) {
    return '\u0411\u0435\u0437 \u0440\u043e\u043b\u0438';
  }

  return roles.map(formatRoleLabel).join(' \u2022 ');
}

function formatStatus(status?: RegistrationStatus | null) {
  switch (status) {
    case 'Submitted':
      return '\u0410\u043d\u043a\u0435\u0442\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0430';
    case 'Confirmed':
      return '\u0423\u0447\u0430\u0441\u0442\u0438\u0435 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e';
    case 'Cancelled':
      return '\u0417\u0430\u044f\u0432\u043a\u0430 \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u0430';
    case 'Draft':
      return '\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d';
    default:
      return '\u0417\u0430\u044f\u0432\u043a\u0430 \u0435\u0449\u0435 \u043d\u0435 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0430';
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '\u041f\u043e\u043a\u0430 \u043d\u0435\u0442';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateRangeCompact(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return '\u0414\u0430\u0442\u044b \u043f\u043e\u043a\u0430 \u043d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u044b';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const starts = formatter.format(new Date(startsAtUtc));
  return endsAtUtc ? `${starts} - ${formatter.format(new Date(endsAtUtc))}` : starts;
}

function formatMoney(value?: number | null, currency = 'RUB') {
  if (value === null || value === undefined) {
    return '\u041f\u043e \u0437\u0430\u043f\u0440\u043e\u0441\u0443';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatOptional(value?: string | null, fallback = '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e') {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function formatYesNo(value?: boolean | null) {
  if (value === undefined || value === null) {
    return '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e';
  }

  return value ? '\u0414\u0430' : '\u041d\u0435\u0442';
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u0430';
  }

  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatAccommodationPreference(value?: AccommodationPreference | null) {
  return value ? accommodationPreferenceLabels[value] ?? value : '\u041d\u0435 \u0443\u043a\u0430\u0437\u0430\u043d\u043e';
}

function normalizeRedirectPath(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/dashboard';
  }

  return trimmed;
}

function getRedirectTargetFromSearch(search: string) {
  return normalizeRedirectPath(new URLSearchParams(search).get('redirect'));
}

function buildAuthPath(path: '/login' | '/register', redirectTarget: string) {
  const normalizedRedirect = normalizeRedirectPath(redirectTarget);
  if (normalizedRedirect === '/dashboard') {
    return path;
  }

  const search = new URLSearchParams({ redirect: normalizedRedirect });
  return `${path}?${search.toString()}`;
}

type RegistrationLinkFocus = 'event' | 'phone' | 'form' | 'summary';

function getRegistrationLink(eventSlug?: string | null, focus?: RegistrationLinkFocus | null) {
  const search = new URLSearchParams();
  if (eventSlug) {
    search.set('event', eventSlug);
  }

  if (focus) {
    search.set('focus', focus);
  }

  const query = search.toString();
  return query ? `/camp-registration?${query}` : '/camp-registration';
}

function getRegistrationActionLink(
  registration: AccountRegistrationSummary,
  isPhoneConfirmed: boolean,
) {
  if (registration.status === 'Draft' && registration.isRegistrationOpen) {
    return getRegistrationLink(registration.eventSlug, isPhoneConfirmed ? 'form' : 'phone');
  }

  if (registration.status === 'Draft') {
    return getRegistrationLink(registration.eventSlug, 'summary');
  }

  if (registration.status === 'Submitted' || registration.status === 'Confirmed' || registration.status === 'Cancelled') {
    return getRegistrationLink(registration.eventSlug, 'summary');
  }

  return getRegistrationLink(registration.eventSlug);
}

function getDashboardRegistrationPriority(status: RegistrationStatus) {
  switch (status) {
    case 'Draft':
      return 0;
    case 'Submitted':
      return 1;
    case 'Confirmed':
      return 2;
    case 'Cancelled':
      return 3;
    default:
      return 4;
  }
}

function getDateSortValue(value?: string | null) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function sortDashboardRegistrations(registrations: AccountRegistrationSummary[]) {
  return [...registrations].sort((left, right) => {
    const byStatus = getDashboardRegistrationPriority(left.status) - getDashboardRegistrationPriority(right.status);
    if (byStatus !== 0) {
      return byStatus;
    }

    if (left.isRegistrationClosingSoon !== right.isRegistrationClosingSoon) {
      return left.isRegistrationClosingSoon ? -1 : 1;
    }

    if (left.isRegistrationOpen !== right.isRegistrationOpen) {
      return left.isRegistrationOpen ? -1 : 1;
    }

    const byStartDate = getDateSortValue(left.eventStartsAtUtc) - getDateSortValue(right.eventStartsAtUtc);
    if (byStartDate !== 0) {
      return byStartDate;
    }

    return new Date(right.updatedAtUtc).getTime() - new Date(left.updatedAtUtc).getTime();
  });
}

function getDashboardActionCard(
  registration: AccountRegistrationSummary | null,
  isPhoneConfirmed: boolean,
) {
  if (!registration) {
    return {
      eyebrow: 'Следующий шаг',
      title: 'Выберите событие и начните первую заявку',
      description: 'Откройте список мероприятий, выберите нужный сезон или выезд и сохраните анкету как черновик, чтобы спокойно вернуться позже.',
      primaryLabel: 'Перейти к мероприятиям',
      primaryTo: getRegistrationLink(undefined, 'event'),
      secondaryLabel: 'Открыть профиль',
      secondaryTo: '/profile',
    };
  }

  const registrationLink = getRegistrationActionLink(registration, isPhoneConfirmed);
  const eventTitle = registration.eventTitle || 'выбранное мероприятие';

  if (registration.status === 'Draft' && !registration.isRegistrationOpen) {
    return {
      eyebrow: 'Окно регистрации уже закрылось',
      title: 'Проверьте черновик и свяжитесь с командой',
      description: `Черновик по событию "${eventTitle}" сохранён, но регистрация сейчас закрыта. Откройте заявку, чтобы сверить данные и посмотреть дальнейшие уведомления от команды.`,
      primaryLabel: 'Открыть заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть уведомления',
      secondaryTo: '/notifications',
    };
  }

  if (registration.status === 'Draft' && registration.isRegistrationClosingSoon) {
    return {
      eyebrow: 'Регистрация скоро закроется',
      title: 'Лучше завершить заявку сейчас',
      description: `По событию "${eventTitle}" уже есть черновик, и окно регистрации скоро закроется. Проверьте участников, подтвердите контакты и отправьте анкету, пока ещё есть время.`,
      primaryLabel: 'Продолжить заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть профиль',
      secondaryTo: '/profile',
    };
  }

  if (registration.status === 'Draft' && !isPhoneConfirmed) {
    return {
      eyebrow: 'Нужно завершить черновик',
      title: 'Подтвердите телефон и отправьте заявку',
      description: `По событию "${eventTitle}" уже есть черновик. Осталось проверить контакты, подтвердить номер и отправить анкету команде.`,
      primaryLabel: 'Продолжить заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть профиль',
      secondaryTo: '/profile',
    };
  }

  if (registration.status === 'Draft') {
    return {
      eyebrow: 'Черновик ждёт завершения',
      title: 'Доведите заявку до отправки',
      description: `Анкета по событию "${eventTitle}" уже сохранена. Вернитесь к ней, проверьте состав участников и отправьте заявку, когда всё будет готово.`,
      primaryLabel: 'Продолжить заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть профиль',
      secondaryTo: '/profile',
    };
  }

  if (registration.status === 'Submitted') {
    return {
      eyebrow: 'Заявка уже у команды',
      title: 'Следите за статусом и уведомлениями',
      description: `Заявка по событию "${eventTitle}" уже отправлена. Сейчас важнее всего отслеживать обновления и при необходимости быстро открыть анкету снова.`,
      primaryLabel: 'Открыть заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть уведомления',
      secondaryTo: '/notifications',
    };
  }

  if (registration.status === 'Confirmed') {
    return {
      eyebrow: 'Участие подтверждено',
      title: 'Проверьте детали поездки',
      description: `По событию "${eventTitle}" участие уже подтверждено. Откройте заявку, чтобы сверить состав, даты и контакты перед выездом.`,
      primaryLabel: 'Открыть заявку',
      primaryTo: registrationLink,
      secondaryLabel: 'Открыть уведомления',
      secondaryTo: '/notifications',
    };
  }

  return {
    eyebrow: 'Можно выбрать новое событие',
    title: 'Текущая заявка не активна',
    description: `По событию "${eventTitle}" заявка сейчас не активна. При необходимости выберите другое мероприятие и начните новую анкету.`,
    primaryLabel: 'Перейти к мероприятиям',
    primaryTo: getRegistrationLink(undefined, 'event'),
    secondaryLabel: 'Открыть уведомления',
    secondaryTo: '/notifications',
  };
}

function toDateTimeLocalInput(value?: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatEventRange(startsAtUtc?: string | null, endsAtUtc?: string | null) {
  if (!startsAtUtc) {
    return 'Даты пока не заданы';
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const starts = formatter.format(new Date(startsAtUtc));
  if (!endsAtUtc) {
    return starts;
  }

  return `${starts} - ${formatter.format(new Date(endsAtUtc))}`;
}

function createEmptyPriceOptionDraft(sortOrder = 0): UpsertAdminEventPriceOptionRequest {
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

function createEmptyScheduleItemDraft(sortOrder = 0): UpsertAdminEventScheduleItemRequest {
  const startsAtUtc = new Date();
  const endsAtUtc = new Date(startsAtUtc.getTime() + 2 * 60 * 60 * 1000);

  return {
    title: '',
    kind: sortOrder === 0 ? 'Arrival' : 'MainProgram',
    startsAtUtc: startsAtUtc.toISOString(),
    endsAtUtc: endsAtUtc.toISOString(),
    location: '',
    notes: '',
    sortOrder,
  };
}

function createEmptyContentBlockDraft(sortOrder = 0): UpsertAdminEventContentBlockRequest {
  return {
    blockType: sortOrder === 0 ? 'Hero' : 'About',
    title: '',
    body: '',
    isPublished: true,
    sortOrder,
  };
}

function createEmptyEventDraft(): UpsertAdminEventRequest {
  const startsAtUtc = new Date();
  const endsAtUtc = new Date(startsAtUtc.getTime() + 3 * 24 * 60 * 60 * 1000);
  const registrationClosesAtUtc = new Date(startsAtUtc.getTime() - 24 * 60 * 60 * 1000);

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
    startsAtUtc: startsAtUtc.toISOString(),
    endsAtUtc: endsAtUtc.toISOString(),
    registrationOpensAtUtc: null,
    registrationClosesAtUtc: registrationClosesAtUtc.toISOString(),
    capacity: null,
    waitlistEnabled: true,
    sortOrder: 0,
    priceOptions: [createEmptyPriceOptionDraft(0)],
    scheduleItems: [createEmptyScheduleItemDraft(0)],
    contentBlocks: [createEmptyContentBlockDraft(0)],
    mediaItems: [],
  };
}

function createDraftFromEvent(event: AdminEventDetails): UpsertAdminEventRequest {
  return {
    seriesSlug: event.seriesSlug,
    seriesTitle: event.seriesTitle,
    kind: event.kind,
    seriesIsActive: event.seriesIsActive,
    slug: event.slug,
    title: event.title,
    seasonLabel: event.seasonLabel ?? '',
    shortDescription: event.shortDescription,
    fullDescription: event.fullDescription ?? '',
    location: event.location ?? '',
    timezone: event.timezone,
    status: event.status,
    startsAtUtc: event.startsAtUtc,
    endsAtUtc: event.endsAtUtc,
    registrationOpensAtUtc: event.registrationOpensAtUtc ?? null,
    registrationClosesAtUtc: event.registrationClosesAtUtc ?? null,
    capacity: event.capacity ?? null,
    waitlistEnabled: event.waitlistEnabled,
    sortOrder: event.sortOrder,
    priceOptions: event.priceOptions.map((item) => ({
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
    scheduleItems: event.scheduleItems.map((item) => ({
      title: item.title,
      kind: item.kind,
      startsAtUtc: item.startsAtUtc,
      endsAtUtc: item.endsAtUtc ?? null,
      location: item.location ?? '',
      notes: item.notes ?? '',
      sortOrder: item.sortOrder,
    })),
    contentBlocks: event.contentBlocks.map((item) => ({
      blockType: item.blockType,
      title: item.title ?? '',
      body: item.body,
      isPublished: item.isPublished,
      sortOrder: item.sortOrder,
    })),
    mediaItems: event.mediaItems.map((item) => ({
      type: item.type,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl ?? '',
      title: item.title ?? '',
      caption: item.caption ?? '',
      isPublished: item.isPublished,
      sortOrder: item.sortOrder,
    })),
  };
}

export const __adminEventEditorLegacyHelpers = {
  eventKindLabels,
  eventStatusLabels,
  scheduleKindLabels,
  contentBlockLabels,
  formatEventKind,
  formatEventStatus,
  formatScheduleKind,
  formatContentBlockType,
  toDateTimeLocalInput,
  fromDateTimeLocalInput,
  formatEventRange,
  createEmptyPriceOptionDraft,
  createEmptyScheduleItemDraft,
  createEmptyContentBlockDraft,
  createEmptyEventDraft,
  createDraftFromEvent,
};

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debouncedValue;
}

function buildPaginationPages(currentPage: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);

  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
}

function PaginationBar({
  page,
  pageSize,
  totalItems,
  totalPages,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const visiblePages = buildPaginationPages(page, totalPages);
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination-bar">
      <div className="pagination-summary">
        <strong>{totalItems ? `${rangeStart}-${rangeEnd} из ${totalItems}` : 'Пока ничего не найдено'}</strong>
        <span>{isLoading ? 'Обновляем список...' : `Страница ${page} из ${totalPages}`}</span>
      </div>

      <div className="pagination-actions">
        <label className="pagination-size">
          <span>На странице</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>

        <button
          className="secondary-button"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={isLoading || page <= 1}
        >
          Назад
        </button>

        <div className="pagination-pages">
          {visiblePages.map((pageNumber) => (
            <button
              className={`pagination-page${pageNumber === page ? ' active' : ''}`}
              type="button"
              key={pageNumber}
              onClick={() => onPageChange(pageNumber)}
              disabled={isLoading || pageNumber === page}
            >
              {pageNumber}
            </button>
          ))}
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={isLoading || page >= totalPages}
        >
          Дальше
        </button>
      </div>
    </div>
  );
}

function findIdentity(identities: ExternalIdentity[] | undefined, provider: string) {
  return identities?.find((identity) => identity.provider === provider) ?? null;
}

function createExternalAuthProviderDraft(provider: AdminExternalAuthProvider): UpdateExternalAuthProviderRequest {
  return {
    enabled: provider.enabled,
    widgetEnabled: provider.mode === 'telegram' ? provider.widgetEnabled : undefined,
    clientId: provider.clientId ?? '',
    clientSecret: '',
    botUsername: provider.botUsername ?? '',
    botToken: '',
    webhookSecret: '',
  };
}

function rolesEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function AppLoader() {
  return (
    <div className="screen-shell center-screen">
      <div className="glass-card loader-card">
        <p className="mini-eyebrow">Blagodaty LK</p>
        <h1>Подготавливаем кабинет</h1>
        <p>Проверяем сессию, права доступа и собираем ваш рабочий экран.</p>
      </div>
    </div>
  );
}

function LandingGate() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const redirectTarget = getRedirectTargetFromSearch(location.search);

  return <Navigate replace to={isAuthenticated ? redirectTarget : buildAuthPath('/login', redirectTarget)} />;
}

function ProtectedLayout() {
  const { isAuthenticated, account, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const canOpenAdmin = isAdmin(account?.user.roles);

  if (!isAuthenticated) {
    const nextPath = `${location.pathname}${location.search}`;
    return <Navigate replace to={buildAuthPath('/login', nextPath)} />;
  }

  return (
    <div className="screen-shell dashboard-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <aside className="sidebar">
        <div>
          <p className="mini-eyebrow">Blagodaty</p>
          <h1>{'\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442'}</h1>
          <p className="sidebar-copy">
            {'\u0426\u0435\u043d\u0442\u0440 \u0434\u043b\u044f \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u043d\u0430 \u043f\u043e\u0435\u0437\u0434\u043a\u0443, \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0444\u0438\u043b\u044f, \u0440\u0430\u0431\u043e\u0442\u044b \u0441 \u0430\u043d\u043a\u0435\u0442\u043e\u0439 \u0438 \u0434\u0430\u043b\u044c\u043d\u0435\u0439\u0448\u0435\u0439 \u0441\u0432\u044f\u0437\u0438 \u0441 \u043a\u043e\u043c\u0430\u043d\u0434\u043e\u0439 \u043b\u0430\u0433\u0435\u0440\u044f.'}
          </p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard">{'\u041e\u0431\u0437\u043e\u0440'}</NavLink>
          <NavLink to="/profile">{'\u041f\u0440\u043e\u0444\u0438\u043b\u044c'}</NavLink>
          <NavLink to="/camp-registration">{'\u041c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f \u0438 \u0437\u0430\u044f\u0432\u043a\u0438'}</NavLink>
          {canOpenAdmin ? <NavLink to="/admin">{'\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435'}</NavLink> : null}
          <NavLink to="/notifications" className="sidebar-link-with-badge">
            <span>{'\u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u044f'}</span>
            {account?.unreadNotificationsCount ? (
              <span className="sidebar-link-badge">{account.unreadNotificationsCount}</span>
            ) : null}
          </NavLink>
          <a href={campBaseUrl} target="_blank" rel="noreferrer">
            {'\u041e\u0442\u043a\u0440\u044b\u0442\u044c camp-\u0441\u0430\u0439\u0442'}
          </a>
        </nav>

        <div className="sidebar-footer">
          <p>{account?.user.displayName ?? '\u0423\u0447\u0430\u0441\u0442\u043d\u0438\u043a'}</p>
          <span className="sidebar-role">{formatRoleList(account?.user.roles)}</span>
          <button
            className="ghost-button"
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            {'\u0412\u044b\u0439\u0442\u0438'}
          </button>
        </div>
      </aside>

      <section className="workspace">
        <Outlet />
      </section>
    </div>
  );
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTarget = getRedirectTargetFromSearch(location.search);
  const loginPath = buildAuthPath('/login', redirectTarget);
  const registerPath = buildAuthPath('/register', redirectTarget);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [providers, setProviders] = useState<PublicExternalAuthProvider[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [pendingExternalAuth, setPendingExternalAuth] = useState<{
    provider: string;
    state: string;
    mode: 'oauth' | 'telegram';
  } | null>(null);
  const [isExternalBusy, setIsExternalBusy] = useState(false);
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const telegramWidgetRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    displayName: '',
  });

  const telegramProvider = providers.find((provider) => provider.provider === 'telegram');
  const oauthProviders = providers.filter((provider) => provider.mode === 'oauth' && provider.enabled);

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate(redirectTarget, { replace: true });
    }
  }, [auth.isAuthenticated, navigate, redirectTarget]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await getPublicExternalAuthProviders();
        if (active) {
          setProviders(Array.isArray(response.providers) ? response.providers : []);
        }
      } catch {
        if (active) {
          setProviders([]);
        }
      } finally {
        if (active) {
          setIsLoadingProviders(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'login' || !telegramWidgetRef.current || !telegramProvider?.widgetEnabled || !telegramProvider.botUsername) {
      return;
    }

    const hostWindow = window as Window & {
      __blagodatyTelegramWidgetAuth?: (user: {
        id: string;
        first_name?: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date: string;
        hash: string;
      }) => void;
    };

    const container = telegramWidgetRef.current;
    container.innerHTML = '';
    setWidgetError(null);

    hostWindow.__blagodatyTelegramWidgetAuth = async (user) => {
      setError(null);
      setWidgetError(null);
      setIsExternalBusy(true);

      try {
        const response = await loginWithTelegramWidget(user);
        await auth.acceptAuthResponse(response);
        toast.success('Вход через Telegram выполнен', 'Профиль подтвержден и готов к работе.');
        navigate(redirectTarget, { replace: true, state: { from: location.pathname } });
      } catch (submitError) {
        const nextError = submitError instanceof Error ? submitError.message : 'Не удалось выполнить вход через Telegram Widget.';
        setError(nextError);
        toast.error('Не удалось войти через Telegram Widget', nextError);
      } finally {
        setIsExternalBusy(false);
      }
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', (telegramProvider.botUsername ?? '').replace(/^@/, ''));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', '__blagodatyTelegramWidgetAuth(user)');
    script.onerror = () => {
      const nextError = 'Не удалось загрузить Telegram Widget. Попробуйте вход через Telegram-бота.';
      setWidgetError(nextError);
      toast.error('Telegram Widget недоступен', nextError);
    };

    container.appendChild(script);

    return () => {
      container.innerHTML = '';
      delete hostWindow.__blagodatyTelegramWidgetAuth;
    };
  }, [auth, location.pathname, mode, navigate, redirectTarget, telegramProvider?.botUsername, telegramProvider?.widgetEnabled]);

  useEffect(() => {
    if (!pendingExternalAuth) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = pendingExternalAuth.mode === 'telegram'
          ? await getTelegramAuthStatus(pendingExternalAuth.state)
          : await getExternalAuthStatus(pendingExternalAuth.state);

        if (cancelled) {
          return;
        }

        if (!response.completed) {
          if (response.status === 'failed' || response.status === 'expired') {
            const nextError = response.message ?? 'Не удалось завершить внешнюю авторизацию.';
            setError(nextError);
            toast.error(`Не удалось войти через ${formatProviderLabel(response.provider || pendingExternalAuth.provider)}`, nextError);
            setPendingExternalAuth(null);
            setIsExternalBusy(false);
          }

          return;
        }

        if (response.auth) {
          await auth.acceptAuthResponse(response.auth);
          setPendingExternalAuth(null);
          setIsExternalBusy(false);
          toast.success(`Вход через ${formatProviderLabel(response.provider || pendingExternalAuth.provider)} выполнен`, 'Рады видеть вас в личном кабинете.');
          navigate(normalizeRedirectPath(response.returnUrl || redirectTarget), { replace: true, state: { from: location.pathname } });
        }
      } catch (pollError) {
        if (!cancelled) {
          const nextError = pollError instanceof Error ? pollError.message : 'Не удалось завершить внешнюю авторизацию.';
          setError(nextError);
          toast.error('Внешняя авторизация не завершена', nextError);
          setPendingExternalAuth(null);
          setIsExternalBusy(false);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth, location.pathname, navigate, pendingExternalAuth, redirectTarget]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await auth.login({
          email: form.email,
          password: form.password,
        });
        toast.success('Вход выполнен', 'Сессия активна, можно продолжать работу.');
      } else {
        await auth.register({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: form.displayName || undefined,
        });
        toast.success('Регистрация завершена', 'Аккаунт создан и личный кабинет готов.');
      }

      navigate(redirectTarget, { replace: true, state: { from: location.pathname } });
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : 'Не удалось выполнить действие.';
      setError(nextError);
      toast.error(mode === 'login' ? 'Не удалось войти' : 'Не удалось зарегистрироваться', nextError);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuthSignIn(provider: PublicExternalAuthProvider) {
    setError(null);
    setIsExternalBusy(true);

    try {
      const started = await startExternalAuth({
        provider: provider.provider,
        intent: 'signin',
        returnUrl: redirectTarget,
      });

      window.open(started.authUrl, `${provider.provider}-auth`, 'width=560,height=720');
      setPendingExternalAuth({
        provider: provider.provider,
        state: started.state,
        mode: 'oauth',
      });
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : `Не удалось начать вход через ${provider.displayName}.`;
      setError(nextError);
      toast.error(`Не удалось открыть ${provider.displayName}`, nextError);
      setIsExternalBusy(false);
    }
  }

  async function handleTelegramBotSignIn() {
    setError(null);
    setIsExternalBusy(true);

    try {
      const started: ExternalAuthStartResponse = await startTelegramAuth({
        intent: 'signin',
        returnUrl: redirectTarget,
      });

      window.open(started.authUrl, 'telegram-auth', 'width=520,height=720');
      setPendingExternalAuth({
        provider: 'telegram',
        state: started.state,
        mode: 'telegram',
      });
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : 'Не удалось начать вход через Telegram.';
      setError(nextError);
      toast.error('Не удалось открыть Telegram', nextError);
      setIsExternalBusy(false);
    }
  }

  return (
    <div className="screen-shell auth-screen">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <div className="auth-layout">
        <section className="glass-card intro-card">
          <p className="mini-eyebrow">Blagodaty LK</p>
          <h1>Регистрация и управление поездкой в одном кабинете</h1>
          <p>
            Здесь мы собираем заявки на Алтай, храним профиль участника и готовим удобное
            пространство для будущих уведомлений от команды лагеря.
          </p>

          <div className="feature-list">
            <article>
              <strong>Профиль участника</strong>
              <span>Контакты, церковь, город и важные данные в одном месте.</span>
            </article>
            <article>
              <strong>Анкета на camp</strong>
              <span>Черновик, отправка заявки и понятный статус участия.</span>
            </article>
            <article>
              <strong>Дальнейшее развитие</strong>
              <span>Следом сюда добавятся оргсообщения, документы и администраторский контур.</span>
            </article>
          </div>
        </section>

        <section className="glass-card auth-card">
          <div className="auth-switch">
            <NavLink to={loginPath} className={({ isActive }) => (isActive ? 'active' : '')}>
              Вход
            </NavLink>
            <NavLink to={registerPath} className={({ isActive }) => (isActive ? 'active' : '')}>
              Регистрация
            </NavLink>
          </div>

          <form className="stack-form" onSubmit={handleSubmit}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@example.com"
                required
              />
            </label>

            <label>
              <span>Пароль</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Минимум 8 символов"
                required
              />
            </label>

            {mode === 'register' ? (
              <>
                <label>
                  <span>Имя</span>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, firstName: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  <span>Фамилия</span>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, lastName: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  <span>Как вас показывать в кабинете</span>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, displayName: event.target.value }))
                    }
                    placeholder="Например, Александр"
                  />
                </label>
              </>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}

            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Подождите...' : mode === 'login' ? 'Войти' : 'Создать кабинет'}
            </button>
          </form>

          <div className="auth-divider">
            <span>или продолжить через</span>
          </div>

          <div className="feature-list auth-provider-list">
            {oauthProviders.map((provider) => (
              <button
                key={provider.provider}
                className="secondary-button"
                type="button"
                disabled={isExternalBusy}
                onClick={async () => handleOAuthSignIn(provider)}
              >
                {isExternalBusy && pendingExternalAuth?.provider === provider.provider
                  ? 'Открываем окно...'
                  : `Войти через ${provider.displayName}`}
              </button>
            ))}

            {telegramProvider?.enabled ? (
              <button
                className="secondary-button"
                type="button"
                disabled={isExternalBusy}
                onClick={handleTelegramBotSignIn}
              >
                {isExternalBusy && pendingExternalAuth?.provider === 'telegram'
                  ? 'Открываем Telegram...'
                  : 'Войти через Telegram-бота'}
              </button>
            ) : null}
          </div>

          {mode === 'login' && telegramProvider?.widgetEnabled ? (
            <div className="stack-form" style={{ marginTop: 18 }}>
              <div>
                <span className="mini-eyebrow">Telegram Widget</span>
                <p className="form-muted">Мгновенный вход, если домен привязан у BotFather.</p>
              </div>
              <div ref={telegramWidgetRef} />
              {widgetError ? <p className="form-error">{widgetError}</p> : null}
            </div>
          ) : null}

          {isLoadingProviders ? <p className="form-muted">Проверяем доступные способы входа...</p> : null}
        </section>
      </div>
    </div>
  );
}

function DashboardPage() {
  const { account } = useAuth();
  const canOpenAdmin = isAdmin(account?.user.roles);
  const registrations = sortDashboardRegistrations(account?.registrations ?? []);
  const nextRegistration = registrations[0] ?? null;
  const isPhoneConfirmed =
    Boolean(account?.user.phoneNumberConfirmed) &&
    normalizePhone(account?.user.phoneNumber ?? '') !== '';
  const hasProfileDetails =
    Boolean(account?.user.city?.trim()) &&
    Boolean(account?.user.churchName?.trim());
  const profileSummary = [account?.user.city?.trim(), account?.user.churchName?.trim()].filter(Boolean).join(' • ');
  const draftCount = registrations.filter((item) => item.status === 'Draft').length;
  const submittedCount = registrations.filter((item) => item.status === 'Submitted').length;
  const confirmedCount = registrations.filter((item) => item.status === 'Confirmed').length;
  const actionCard = getDashboardActionCard(nextRegistration, isPhoneConfirmed);

  return (
    <div className="page-stack">
      <header className="page-hero glass-card">
        <div>
          <p className="mini-eyebrow">Обзор</p>
          <h2>Здравствуйте, {account?.user.displayName}</h2>
          <p>Здесь видно ваши мероприятия, статусы заявок и следующие шаги по каждому событию.</p>
        </div>

        <div className="status-badge">
          <span>Ближайший статус</span>
          <strong>{formatStatus(nextRegistration?.status ?? account?.registration?.status)}</strong>
        </div>
      </header>

      <section className="glass-card callout-card">
        <p className="mini-eyebrow">{actionCard.eyebrow}</p>
        <h3>{actionCard.title}</h3>
        <p>{actionCard.description}</p>
        <div className="role-pills">
          {nextRegistration ? <span className="role-pill">{formatStatus(nextRegistration.status)}</span> : null}
          <span className="role-pill">{isPhoneConfirmed ? 'Телефон подтверждён' : 'Телефон не подтверждён'}</span>
          {draftCount ? <span className="role-pill">Черновиков: {draftCount}</span> : null}
          {submittedCount ? <span className="role-pill">Отправлены: {submittedCount}</span> : null}
          {confirmedCount ? <span className="role-pill">Подтверждены: {confirmedCount}</span> : null}
        </div>
        <div className="inline-links">
          <NavLink to={actionCard.primaryTo}>{actionCard.primaryLabel}</NavLink>
          <NavLink to={actionCard.secondaryTo}>{actionCard.secondaryLabel}</NavLink>
          {canOpenAdmin ? <NavLink to="/admin">Открыть админку</NavLink> : null}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="glass-card metric-card">
          <p>Аккаунт</p>
          <strong>{account?.user.email}</strong>
          <span>Роль: {formatRoleList(account?.user.roles)}</span>
        </article>

        <article className="glass-card metric-card">
          <p>Телефон</p>
          <strong>{account?.user.phoneNumber || 'Пока не указан'}</strong>
          <span>
            {isPhoneConfirmed
              ? 'Номер готов для уведомлений и финальной отправки анкеты.'
              : 'Подтвердите номер, чтобы отправлять заявки без задержек.'}
          </span>
        </article>

        <article className="glass-card metric-card">
          <p>Уведомления</p>
          <strong>{account?.unreadNotificationsCount ?? 0}</strong>
          <span>
            {(account?.unreadNotificationsCount ?? 0) > 0
              ? 'Есть непрочитанные обновления по заявкам или профилю.'
              : 'Новых уведомлений пока нет, но здесь появятся важные обновления от команды.'}
          </span>
        </article>

        <article className="glass-card metric-card">
          <p>Профиль</p>
          <strong>{profileSummary || 'Профиль ещё не заполнен'}</strong>
          <span>
            {hasProfileDetails
              ? 'Основные данные уже заполнены и помогут команде быстрее обработать ваши заявки.'
              : 'Добавьте город и церковь, чтобы организаторам было проще с вами связаться.'}
          </span>
        </article>

        <article className="glass-card metric-card">
          <p>Черновики</p>
          <strong>{draftCount}</strong>
          <span>
            {draftCount
              ? 'Есть незавершённые анкеты. Лучше довести их до отправки, пока регистрация открыта.'
              : 'Новых черновиков нет. Можно начать новую заявку или проверить уже отправленные.'}
          </span>
        </article>

        <article className="glass-card metric-card">
          <p>Заявки</p>
          <strong>{registrations.length}</strong>
          <span>
            {submittedCount || confirmedCount
              ? `Отправлены: ${submittedCount}. Подтверждены: ${confirmedCount}.`
              : 'Можно вести несколько мероприятий: лагерь по сезонам, ретриты и другие события.'}
          </span>
        </article>

        <article className="glass-card metric-card">
          <p>Следующее мероприятие</p>
          <strong>{nextRegistration?.eventTitle || 'Пока не выбрано'}</strong>
          <span>
            {nextRegistration
              ? `${formatDateRangeCompact(nextRegistration.eventStartsAtUtc, nextRegistration.eventEndsAtUtc)}${nextRegistration.eventLocation ? ` • ${nextRegistration.eventLocation}` : ''}`
              : 'Откройте раздел заявок и выберите ближайшее событие.'}
          </span>
        </article>
      </section>

      <section className="glass-card stack-form">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Мои мероприятия</p>
            <h3>Регистрации по событиям и сезонам</h3>
          </div>
          <p className="form-muted">
            Здесь собраны все ваши заявки, поэтому больше не нужно держать в голове только один текущий лагерь.
          </p>
        </div>

        <div className="user-list">
          {registrations.length ? (
            registrations.map((registration) => (
              <article className="user-card" key={registration.id}>
                <div className="user-card-head">
                  <div>
                    <strong className="user-name">{registration.eventTitle || 'Мероприятие'}</strong>
                    <p className="user-meta">
                      {registration.eventSeriesTitle || 'Серия не указана'}
                      {registration.eventSeasonLabel ? ` • ${registration.eventSeasonLabel}` : ''}
                    </p>
                  </div>

                  <div className="role-pills">
                    <span className="role-pill">{formatStatus(registration.status)}</span>
                    <span className="role-pill muted-pill">
                      {registration.isRegistrationOpen ? 'Регистрация открыта' : 'Регистрация закрыта'}
                    </span>
                    <span className="role-pill muted-pill">Участников: {registration.participantsCount}</span>
                    {registration.isRegistrationClosingSoon ? (
                      <span className="role-pill muted-pill">Скоро закрывается</span>
                    ) : null}
                  </div>
                </div>

                <div className="user-info-grid">
                  <div>
                    <span>Даты</span>
                    <strong>{formatDateRangeCompact(registration.eventStartsAtUtc, registration.eventEndsAtUtc)}</strong>
                  </div>
                  <div>
                    <span>Локация</span>
                    <strong>{registration.eventLocation || 'Уточняется'}</strong>
                  </div>
                  <div>
                    <span>Тариф</span>
                    <strong>
                      {registration.selectedPriceOptionTitle
                        ? `${registration.selectedPriceOptionTitle} • ${formatMoney(
                            registration.selectedPriceOptionAmount,
                            registration.selectedPriceOptionCurrency || 'RUB',
                          )}`
                        : 'Пока не выбран'}
                    </strong>
                  </div>
                  <div>
                    <span>Обновлено</span>
                    <strong>{formatDateTime(registration.updatedAtUtc)}</strong>
                  </div>
                </div>

                <div className="inline-links">
                  <NavLink to={getRegistrationActionLink(registration, isPhoneConfirmed)}>Открыть заявку</NavLink>
                  <NavLink to="/notifications">Уведомления</NavLink>
                </div>
              </article>
            ))
          ) : (
            <article className="user-card admin-empty-state">
              <strong className="user-name">Пока нет ни одной заявки</strong>
              <p className="form-muted">
                Откройте список мероприятий, выберите нужное событие и сохраните анкету как черновик или отправьте ее сразу.
              </p>
              <div className="inline-links">
                <NavLink to={getRegistrationLink(undefined, 'event')}>Открыть мероприятия</NavLink>
                <NavLink to="/profile">Заполнить профиль</NavLink>
              </div>
            </article>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfilePage() {
  const auth = useAuth();
  const toast = useToast();
  const { account, updateProfile } = auth;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<{
    provider: string;
    state: string;
    mode: 'oauth' | 'telegram';
  } | null>(null);
  const [form, setForm] = useState<UpdateProfileRequest>({
    firstName: '',
    lastName: '',
    displayName: '',
    phoneNumber: '',
    city: '',
    churchName: '',
  });

  useEffect(() => {
    if (!account) {
      return;
    }

    setForm({
      firstName: account.user.firstName,
      lastName: account.user.lastName,
      displayName: account.user.displayName,
      phoneNumber: account.user.phoneNumber ?? '',
      city: account.user.city ?? '',
      churchName: account.user.churchName ?? '',
    });
  }, [account?.user.id]);

  const isProfilePhoneConfirmed =
    Boolean(account?.user.phoneNumberConfirmed) &&
    normalizePhone(form.phoneNumber) !== '' &&
    normalizePhone(form.phoneNumber) === normalizePhone(account?.user.phoneNumber ?? '');

  useEffect(() => {
    if (!pendingLink) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = pendingLink.mode === 'telegram'
          ? await getTelegramAuthStatus(pendingLink.state)
          : await getExternalAuthStatus(pendingLink.state);

        if (cancelled) {
          return;
        }

        if (!response.completed) {
          if (response.status === 'failed' || response.status === 'expired') {
            const nextError = response.message ?? 'Не удалось завершить привязку.';
            setError(nextError);
            toast.error(`Не удалось подключить ${formatProviderLabel(response.provider || pendingLink.provider)}`, nextError);
            setPendingLink(null);
            setLinkingProvider(null);
          }

          return;
        }

        setPendingLink(null);
        setLinkingProvider(null);
        await auth.reloadAccount();
        const successMessage = `${formatProviderLabel(response.provider || pendingLink.provider)} подключен к профилю.`;
        setMessage(successMessage);
        toast.success('Способ входа подключен', successMessage);
      } catch (linkError) {
        if (!cancelled) {
          const nextError = linkError instanceof Error ? linkError.message : 'Не удалось завершить привязку.';
          setError(nextError);
          toast.error('Привязка не завершена', nextError);
          setPendingLink(null);
          setLinkingProvider(null);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth, pendingLink]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      await updateProfile(form);
      setMessage('Профиль сохранен.');
      toast.success('Профиль сохранен', 'Изменения уже доступны в личном кабинете.');
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : 'Не удалось сохранить профиль.';
      setError(nextError);
      toast.error('Не удалось сохранить профиль', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLink(provider: PublicExternalAuthProvider) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setLinkingProvider(provider.provider);

    try {
      const started = provider.provider === 'telegram'
        ? await startTelegramAuth({ intent: 'link', returnUrl: '/profile' }, auth.session.accessToken)
        : await startExternalAuth(
            {
              provider: provider.provider,
              intent: 'link',
              returnUrl: '/profile',
            },
            auth.session.accessToken,
          );

      window.open(
        started.authUrl,
        provider.provider === 'telegram' ? 'telegram-link' : `${provider.provider}-link`,
        'width=560,height=720',
      );

      setPendingLink({
        provider: provider.provider,
        state: started.state,
        mode: provider.provider === 'telegram' ? 'telegram' : 'oauth',
      });
    } catch (linkError) {
      const nextError = linkError instanceof Error ? linkError.message : `Не удалось начать привязку ${provider.displayName}.`;
      setError(nextError);
      toast.error(`Не удалось открыть ${provider.displayName}`, nextError);
      setLinkingProvider(null);
    }
  }

  async function handleUnlink(provider: string) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setUnlinkingProvider(provider);

    try {
      await unlinkExternalIdentity(auth.session.accessToken, provider);
      await auth.reloadAccount();
      const successMessage = `${formatProviderLabel(provider)} отвязан от профиля.`;
      setMessage(successMessage);
      toast.success('Способ входа отвязан', successMessage);
    } catch (unlinkError) {
      const nextError = unlinkError instanceof Error ? unlinkError.message : 'Не удалось отвязать внешний аккаунт.';
      setError(nextError);
      toast.error('Не удалось отвязать способ входа', nextError);
    } finally {
      setUnlinkingProvider(null);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-hero glass-card compact-hero">
        <div>
          <p className="mini-eyebrow">Профиль</p>
          <h2>Базовые данные участника</h2>
          <p>Этот блок станет основой для персональных сценариев кабинета и для работы команды лагеря.</p>
        </div>
      </header>

      <form className="glass-card stack-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>Имя</span>
            <input
              value={form.firstName}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
              required
            />
          </label>

          <label>
            <span>Фамилия</span>
            <input
              value={form.lastName}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
              required
            />
          </label>

          <label>
            <span>Отображаемое имя</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              required
            />
          </label>

          <label>
            <span>Телефон</span>
            <input
              value={form.phoneNumber}
              onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
            />
            <small className={`form-muted${isProfilePhoneConfirmed ? ' form-success-inline' : ''}`}>
              {isProfilePhoneConfirmed
                ? 'Номер подтверждён и уже используется для уведомлений.'
                : 'Если меняете номер, подтвердите его здесь же до отправки заявок.'}
            </small>
          </label>

          <label>
            <span>Город</span>
            <input
              value={form.city}
              onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
            />
          </label>

          <label>
            <span>Церковь</span>
            <input
              value={form.churchName}
              onChange={(event) => setForm((current) => ({ ...current, churchName: event.target.value }))}
            />
          </label>
        </div>

        <PhoneVerificationPanel
          accessToken={auth.session?.accessToken ?? null}
          phoneNumber={form.phoneNumber ?? ''}
          isConfirmed={isProfilePhoneConfirmed}
          onPhoneNumberChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
          onAccountReload={auth.reloadAccount}
          onVerified={async () => {
            setMessage('Номер телефона подтверждён.');
            setError(null);
            toast.success('Телефон подтверждён', 'Профиль теперь использует подтверждённый номер.');
          }}
        />

        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
      </form>

      <section className="glass-card stack-form">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Способы входа</p>
            <h3>Привязанные аккаунты</h3>
          </div>
          <p className="form-muted">
            {account?.hasPassword
              ? 'Email и пароль активны. Можно безопасно подключать и отвязывать соцсети.'
              : 'У вас внешний вход без пароля. Не отвязывайте последний способ входа.'}
          </p>
        </div>

        <div className="user-list">
          {(account?.availableExternalAuthProviders ?? [])
            .filter((provider) => provider.enabled)
            .map((provider) => {
              const identity = findIdentity(account?.externalIdentities, provider.provider);
              const isLinking = linkingProvider === provider.provider;
              const isUnlinking = unlinkingProvider === provider.provider;

              return (
                <article className="user-card" key={provider.provider}>
                  <div className="user-card-head">
                    <div>
                      <strong className="user-name">{provider.displayName}</strong>
                      <p className="user-meta">
                        {identity
                          ? identity.providerEmail || identity.providerUsername || identity.displayName
                          : provider.provider === 'telegram'
                            ? 'Бот и widget для быстрого входа'
                            : 'Вход и регистрация через OAuth'}
                      </p>
                    </div>

                    <div className="role-pills">
                      <span className={`role-pill ${identity ? '' : 'muted-pill'}`}>
                        {identity ? 'Подключен' : 'Не подключен'}
                      </span>
                    </div>
                  </div>

                  <div className="user-info-grid">
                    <div>
                      <span>Провайдер</span>
                      <strong>{formatProviderLabel(provider.provider)}</strong>
                    </div>
                    <div>
                      <span>Последнее использование</span>
                      <strong>{identity?.lastUsedAtUtc ? formatDateTime(identity.lastUsedAtUtc) : 'Пока нет'}</strong>
                    </div>
                    <div>
                      <span>Имя в системе</span>
                      <strong>{identity?.displayName || 'Еще не подключено'}</strong>
                    </div>
                    <div>
                      <span>Username</span>
                      <strong>{identity?.providerUsername || '—'}</strong>
                    </div>
                  </div>

                  <div className="action-row">
                    {identity ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={isUnlinking || !!linkingProvider}
                        onClick={async () => handleUnlink(provider.provider)}
                      >
                        {isUnlinking ? 'Отвязываем...' : 'Отвязать'}
                      </button>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={isLinking || !!unlinkingProvider}
                        onClick={async () => handleLink(provider)}
                      >
                        {isLinking
                          ? provider.provider === 'telegram'
                            ? 'Открываем Telegram...'
                            : 'Открываем окно...'
                          : `Подключить ${provider.displayName}`}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}

function AdminPage() {
  const auth = useAuth();
  const toast = useToast();
  const location = useLocation();
  const canOpenAdmin = isAdmin(auth.account?.user.roles);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [authSettings, setAuthSettings] = useState<AdminExternalAuthSettings | null>(null);
  const [adminEvents, setAdminEvents] = useState<AdminEventSummary[]>([]);
  const [usersPage, setUsersPage] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [registrationsPage, setRegistrationsPage] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, UpdateExternalAuthProviderRequest>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole[]>>({});
  const [registrationStatusDrafts, setRegistrationStatusDrafts] = useState<Record<string, RegistrationStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isRegistrationsLoading, setIsRegistrationsLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingRegistrationId, setSavingRegistrationId] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [pendingProviderTest, setPendingProviderTest] = useState<{
    provider: string;
    state: string;
    mode: 'oauth' | 'telegram';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | AppRole>('all');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState<'all' | RegistrationStatus>('all');
  const [registrationEventFilter, setRegistrationEventFilter] = useState<'all' | string>('all');
  const [registrationPage, setRegistrationPage] = useState(1);
  const [registrationPageSize, setRegistrationPageSize] = useState(20);
  const debouncedUserSearch = useDebouncedValue(userSearch);
  const debouncedRegistrationSearch = useDebouncedValue(registrationSearch);
  const adminSection = location.pathname.startsWith('/admin/events')
    ? 'events'
    : location.pathname.startsWith('/admin/gallery')
    ? 'gallery'
    : location.pathname.startsWith('/admin/site')
    ? 'site'
    : location.pathname.startsWith('/admin/telegram')
    ? 'telegram'
    : location.pathname.startsWith('/admin/backups')
    ? 'backups'
    : location.pathname.startsWith('/admin/auth')
    ? 'auth'
    : location.pathname.startsWith('/admin/roles')
      ? 'roles'
      : location.pathname.startsWith('/admin/registrations')
        ? 'registrations'
        : location.pathname.startsWith('/admin/users') || location.pathname.startsWith('/admin/access')
          ? 'users'
      : 'overview';

  useEffect(() => {
    if (!canOpenAdmin || !auth.session) {
      setIsLoading(false);
      return;
    }

    void loadOverview();
  }, [auth.session?.accessToken, canOpenAdmin]);

  useEffect(() => {
    if (!canOpenAdmin || !auth.session || adminSection !== 'auth') {
      return;
    }

    void loadAuthSettings();
  }, [adminSection, auth.session?.accessToken, canOpenAdmin]);

  useEffect(() => {
    if (!canOpenAdmin || !auth.session || adminSection !== 'users') {
      return;
    }

    void loadUsersPage();
  }, [adminSection, auth.session?.accessToken, canOpenAdmin, debouncedUserSearch, userPage, userPageSize, userRoleFilter]);

  useEffect(() => {
    if (!canOpenAdmin || !auth.session || adminSection !== 'registrations') {
      return;
    }

    void loadAdminEventsList();
    void loadRegistrationsPage();
  }, [
    adminSection,
    auth.session?.accessToken,
    canOpenAdmin,
    debouncedRegistrationSearch,
    registrationEventFilter,
    registrationPage,
    registrationPageSize,
    registrationStatusFilter,
  ]);

  async function loadOverview(silent = false) {
    if (!auth.session) {
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const loaded = await getAdminOverview(auth.session.accessToken);
      setOverview(loaded);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить админский раздел.';
      setError(nextError);
      toast.error('Не удалось открыть админку', nextError);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }

  async function loadAuthSettings(silent = false) {
    if (!auth.session) {
      return;
    }

    if (!silent) {
      setIsAuthLoading(true);
    }

    setError(null);

    try {
      const loadedAuthSettings = await getAdminExternalAuthSettings(auth.session.accessToken);
      setAuthSettings(loadedAuthSettings);
      setProviderDrafts(
        Object.fromEntries(
          loadedAuthSettings.providers.map((provider) => [provider.provider, createExternalAuthProviderDraft(provider)]),
        ) as Record<string, UpdateExternalAuthProviderRequest>,
      );
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0432\u043d\u0435\u0448\u043d\u0435\u0439 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u0438.';
      setError(nextError);
      toast.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c auth-\u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438', nextError);
    } finally {
      if (!silent) {
        setIsAuthLoading(false);
      }
    }
  }

  async function loadAdminEventsList() {
    if (!auth.session) {
      return;
    }

    try {
      const response = await getAdminEvents(auth.session.accessToken);
      setAdminEvents(response.events);
    } catch {
      // keep registrations usable even if the filter list fails to refresh
    }
  }

  async function loadUsersPage() {
    if (!auth.session) {
      return;
    }

    setIsUsersLoading(true);
    setError(null);

    try {
      const loadedUsers = await getAdminUsers(auth.session.accessToken, {
        page: userPage,
        pageSize: userPageSize,
        search: debouncedUserSearch,
        role: userRoleFilter,
      });

      setUsersPage(loadedUsers);
      syncRoleDrafts(loadedUsers.items);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439.';
      setError(nextError);
      toast.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0435\u0439', nextError);
    } finally {
      setIsUsersLoading(false);
    }
  }

  async function loadRegistrationsPage() {
    if (!auth.session) {
      return;
    }

    setIsRegistrationsLoading(true);
    setError(null);

    try {
      const loadedRegistrations = await getAdminRegistrations(auth.session.accessToken, {
        page: registrationPage,
        pageSize: registrationPageSize,
        search: debouncedRegistrationSearch,
        status: registrationStatusFilter,
        eventEditionId: registrationEventFilter,
      });

      setRegistrationsPage(loadedRegistrations);
      syncRegistrationStatusDrafts(loadedRegistrations.items);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0441\u043f\u0438\u0441\u043e\u043a \u0430\u043d\u043a\u0435\u0442.';
      setError(nextError);
      toast.error('\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0430\u043d\u043a\u0435\u0442\u044b', nextError);
    } finally {
      setIsRegistrationsLoading(false);
    }
  }

  function syncRoleDrafts(users: AdminUser[]) {
    if (!users.length) {
      return;
    }

    setRoleDrafts((current) => ({
      ...current,
      ...Object.fromEntries(users.map((user) => [user.id, orderRoles([...user.roles])])) as Record<string, AppRole[]>,
    }));
  }

  function syncRegistrationStatusDrafts(users: AdminUser[]) {
    if (!users.length) {
      return;
    }

    setRegistrationStatusDrafts((current) => ({
      ...current,
      ...Object.fromEntries(
        users
          .filter((user) => user.registrationId && user.registrationStatus)
          .map((user) => [user.registrationId as string, user.registrationStatus as RegistrationStatus]),
      ) as Record<string, RegistrationStatus>,
    }));
  }

  function replacePagedUser(
    currentPage: PaginatedResponse<AdminUser> | null,
    updatedUser: AdminUser,
  ): PaginatedResponse<AdminUser> | null {
    return currentPage
      ? {
          ...currentPage,
          items: currentPage.items.map((item) => (item.id === updatedUser.id ? updatedUser : item)),
        }
      : currentPage;
  }

  function getDraftRegistrationStatus(user: AdminUser) {
    if (!user.registrationId) {
      return user.registrationStatus ?? 'Draft';
    }

    return registrationStatusDrafts[user.registrationId] ?? user.registrationStatus ?? 'Draft';
  }

  useEffect(() => {
    if (!pendingProviderTest || !auth.session) {
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const response = pendingProviderTest.mode === 'telegram'
          ? await getTelegramAuthStatus(pendingProviderTest.state)
          : await getExternalAuthStatus(pendingProviderTest.state);

        if (cancelled) {
          return;
        }

        if (!response.completed) {
          if (response.status === 'failed' || response.status === 'expired') {
            const nextError = response.message ?? 'Проверка провайдера не завершилась успешно.';
            setError(nextError);
            toast.error(`Проверка ${formatProviderLabel(response.provider || pendingProviderTest.provider)} не прошла`, nextError);
            setPendingProviderTest(null);
            setTestingProvider(null);
          }

          return;
        }

        const successMessage = response.message ?? `Проверка ${formatProviderLabel(response.provider || pendingProviderTest.provider)} завершена успешно.`;
        setMessage(successMessage);
        toast.success(`${formatProviderLabel(response.provider || pendingProviderTest.provider)} настроен`, successMessage);
        setPendingProviderTest(null);
        setTestingProvider(null);

        await loadAuthSettings(true);
        if (cancelled) {
          return;
        }
      } catch (testError) {
        if (!cancelled) {
          const nextError = testError instanceof Error ? testError.message : 'Не удалось завершить проверку провайдера.';
          setError(nextError);
          toast.error('Проверка провайдера не завершена', nextError);
          setPendingProviderTest(null);
          setTestingProvider(null);
        }
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [auth.session, pendingProviderTest]);

  function getDraftRoles(user: AdminUser) {
    return roleDrafts[user.id] ?? orderRoles([...user.roles]);
  }

  function toggleRole(user: AdminUser, role: AdminRoleDefinition['id'], checked: boolean) {
    setRoleDrafts((current) => {
      const source = new Set(getDraftRoles(user));
      if (checked) {
        source.add(role);
      } else {
        source.delete(role);
      }

      return {
        ...current,
        [user.id]: orderRoles([...source] as AppRole[]),
      };
    });
  }

  function resetRoles(user: AdminUser) {
    setRoleDrafts((current) => ({
      ...current,
      [user.id]: orderRoles([...user.roles]),
    }));
  }

  function getProviderDraft(provider: AdminExternalAuthProvider) {
    return providerDrafts[provider.provider] ?? createExternalAuthProviderDraft(provider);
  }

  function updateProviderDraft(provider: string, patch: Partial<UpdateExternalAuthProviderRequest>) {
    setProviderDrafts((current) => ({
      ...current,
      [provider]: {
        ...current[provider],
        ...patch,
      },
    }));
  }

  async function saveRoles(user: AdminUser) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setSavingUserId(user.id);

    try {
      const updatedUser = await updateUserRoles(auth.session.accessToken, user.id, getDraftRoles(user));
      setUsersPage((current) => replacePagedUser(current, updatedUser));
      setRegistrationsPage((current) => replacePagedUser(current, updatedUser));
      setRoleDrafts((current) => ({
        ...current,
        [updatedUser.id]: orderRoles([...updatedUser.roles]),
      }));
      await loadOverview(true);
      const successMessage = `Права пользователя ${updatedUser.displayName} обновлены.`;
      setMessage(successMessage);
      toast.success('Роли обновлены', successMessage);

      if (auth.account?.user.id === updatedUser.id) {
        await auth.reloadAccount();
      }
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось обновить роли пользователя.';
      setError(nextError);
      toast.error('Не удалось сохранить роли', nextError);
    } finally {
      setSavingUserId(null);
    }
  }

  async function saveRegistrationStatus(user: AdminUser) {
    if (!auth.session || !user.registrationId) {
      return;
    }

    setMessage(null);
    setError(null);
    setSavingRegistrationId(user.registrationId);

    try {
      const updatedUser = await updateAdminRegistrationStatus(
        auth.session.accessToken,
        user.registrationId,
        getDraftRegistrationStatus(user),
      );

      setUsersPage((current) => replacePagedUser(current, updatedUser));
      setRegistrationsPage((current) => replacePagedUser(current, updatedUser));
      if (updatedUser.registrationId && updatedUser.registrationStatus) {
        setRegistrationStatusDrafts((current) => ({
          ...current,
          [updatedUser.registrationId as string]: updatedUser.registrationStatus as RegistrationStatus,
        }));
      }

      await loadOverview(true);
      const successMessage = `Статус заявки пользователя ${updatedUser.displayName} обновлён.`;
      setMessage(successMessage);
      toast.success('Статус заявки обновлён', successMessage);

      if (auth.account?.user.id === updatedUser.id) {
        await auth.reloadAccount();
      }
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось обновить статус заявки.';
      setError(nextError);
      toast.error('Не удалось сохранить статус заявки', nextError);
    } finally {
      setSavingRegistrationId(null);
    }
  }

  async function saveProvider(provider: AdminExternalAuthProvider) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setSavingProvider(provider.provider);

    try {
      const updated = await updateAdminExternalAuthProvider(
        auth.session.accessToken,
        provider.provider,
        getProviderDraft(provider),
      );

      setAuthSettings((current) =>
        current
          ? {
              ...current,
              providers: current.providers.map((item) => (item.provider === updated.provider ? updated : item)),
            }
          : current,
      );
      setProviderDrafts((current) => ({
        ...current,
        [updated.provider]: createExternalAuthProviderDraft(updated),
      }));
      const successMessage = `Настройки ${updated.displayName} сохранены.`;
      setMessage(successMessage);
      toast.success('Настройки провайдера сохранены', successMessage);
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить настройки провайдера.';
      setError(nextError);
      toast.error('Не удалось сохранить настройки провайдера', nextError);
    } finally {
      setSavingProvider(null);
    }
  }

  async function startProviderTest(provider: AdminExternalAuthProvider) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setTestingProvider(provider.provider);

    try {
      const started = await startAdminExternalAuthProviderTest(auth.session.accessToken, provider.provider);
      window.open(
        started.authUrl,
        provider.provider === 'telegram' ? 'telegram-auth-test' : `${provider.provider}-auth-test`,
        'width=560,height=720',
      );
      setPendingProviderTest({
        provider: provider.provider,
        state: started.state,
        mode: provider.provider === 'telegram' ? 'telegram' : 'oauth',
      });
      toast.info(
        `Проверяем ${provider.displayName}`,
        provider.provider === 'telegram'
          ? 'Подтвердите вход в Telegram-боте, затем мы покажем результат.'
          : 'Завершите вход у провайдера во всплывающем окне.',
      );
    } catch (testError) {
      const nextError = testError instanceof Error ? testError.message : 'Не удалось запустить проверку провайдера.';
      setError(nextError);
      toast.error(`Не удалось проверить ${provider.displayName}`, nextError);
      setTestingProvider(null);
    }
  }

  const filteredUsers = usersPage?.items ?? [];
  const filteredRegistrations = registrationsPage?.items ?? [];

  if (!canOpenAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  const adminHeader = adminSection === 'events'
  ? {
      eyebrow: '\u041c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f',
      title: '\u0421\u0435\u0437\u043e\u043d\u044b, \u0432\u044b\u043f\u0443\u0441\u043a\u0438 \u0438 \u0443\u0441\u043b\u043e\u0432\u0438\u044f \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438',
      description:
        '\u0417\u0434\u0435\u0441\u044c \u043c\u043e\u0436\u043d\u043e \u0432\u0435\u0441\u0442\u0438 \u043b\u0430\u0433\u0435\u0440\u044f \u043f\u043e \u0433\u043e\u0434\u0430\u043c, \u0434\u043e\u0431\u0430\u0432\u043b\u044f\u0442\u044c \u0434\u0440\u0443\u0433\u0438\u0435 \u0441\u043e\u0431\u044b\u0442\u0438\u044f, \u043d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044c \u0434\u0430\u0442\u044b, \u0442\u0430\u0440\u0438\u0444\u044b \u0438 \u043a\u043e\u043d\u0442\u0435\u043d\u0442 \u0434\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438.',
    }
  : adminSection === 'gallery'
  ? {
      eyebrow: '\u0413\u0430\u043b\u0435\u0440\u0435\u044f',
      title: '\u041c\u0435\u0434\u0438\u0430\u0442\u0435\u043a\u0430 \u0438 \u0444\u0430\u0439\u043b\u044b \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0435',
      description:
        '\u0417\u0434\u0435\u0441\u044c \u043c\u043e\u0436\u043d\u043e \u0437\u0430\u0433\u0440\u0443\u0436\u0430\u0442\u044c \u0444\u043e\u0442\u043e, \u0432\u0438\u0434\u0435\u043e \u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440, \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u044c \u0433\u043e\u0442\u043e\u0432\u044b\u0435 URL \u0438 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0438\u0445 \u0432 \u043c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f\u0445 \u0438 \u043d\u0430 \u043f\u0443\u0431\u043b\u0438\u0447\u043d\u043e\u043c \u0441\u0430\u0439\u0442\u0435.',
    }
  : adminSection === 'site'
  ? {
      eyebrow: '\u0421\u0430\u0439\u0442',
      title: '\u041f\u0443\u0431\u043b\u0438\u0447\u043d\u044b\u0435 \u0441\u0441\u044b\u043b\u043a\u0438 \u0438 \u0441\u043e\u0446\u0441\u0435\u0442\u0438',
      description:
        '\u0417\u0434\u0435\u0441\u044c \u043d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u044e\u0442\u0441\u044f Telegram, VK, YouTube, официальный сайт и другие каналы, которые показываются на публичной странице.',
    }
  : adminSection === 'telegram'
  ? {
      eyebrow: 'Telegram',
      title: 'Бот, чаты и команды команды',
      description:
        'Здесь собраны Telegram-группы, привязки к событиям, последние команды бота и управление тем, какие уведомления прилетают в рабочие чаты.',
    }
  : adminSection === 'backups'
  ? {
      eyebrow: '\u0420\u0435\u0437\u0435\u0440\u0432\u043d\u044b\u0435 \u043a\u043e\u043f\u0438\u0438',
      title: '\u0411\u044d\u043a\u0430\u043f\u044b \u0431\u0430\u0437\u044b \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u0430\u0434\u043c\u0438\u043d\u0430\u043c',
      description:
        '\u0417\u0434\u0435\u0441\u044c \u043d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u044e\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u0434\u0430\u043c\u043f\u044b, \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0444\u0430\u0439\u043b\u043e\u0432, \u0440\u0443\u0447\u043d\u044b\u0435 \u0441\u043d\u0438\u043c\u043a\u0438 \u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u0433\u043e\u0442\u043e\u0432\u043e\u0439 \u0431\u0430\u0437\u044b \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0430\u043c \u0447\u0435\u0440\u0435\u0437 Telegram-\u0431\u043e\u0442\u0430.',
    }
  : adminSection === 'auth'
  ? {
      eyebrow: '\u0412\u043d\u0435\u0448\u043d\u044f\u044f \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u0430\u0446\u0438\u044f',
      title: '\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b \u0432\u0445\u043e\u0434\u0430 \u0438 \u0436\u0443\u0440\u043d\u0430\u043b \u043f\u0440\u043e\u0432\u0435\u0440\u043e\u043a',
      description: '\u0417\u0434\u0435\u0441\u044c \u0443\u0434\u043e\u0431\u043d\u043e \u043d\u0430\u0441\u0442\u0440\u0430\u0438\u0432\u0430\u0442\u044c Google, VK, Yandex \u0438 Telegram, \u0430 \u0437\u0430\u0442\u0435\u043c \u0441\u0440\u0430\u0437\u0443 \u043f\u0440\u043e\u0432\u0435\u0440\u044f\u0442\u044c \u043a\u0430\u0436\u0434\u044b\u0439 \u0441\u043f\u043e\u0441\u043e\u0431 \u0432\u0445\u043e\u0434\u0430.',
    }
  : adminSection === 'roles'
    ? {
        eyebrow: '\u0420\u043e\u043b\u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u044b',
        title: '\u0420\u043e\u043b\u0438, \u0437\u043e\u043d\u044b \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u0438 \u0441\u043e\u0441\u0442\u0430\u0432',
        description: '\u0417\u0434\u0435\u0441\u044c \u0432\u0438\u0434\u043d\u043e, \u043a\u0430\u043a\u0438\u0435 \u0440\u043e\u043b\u0438 \u0435\u0441\u0442\u044c \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0435, \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u043b\u044e\u0434\u0435\u0439 \u0441\u0435\u0439\u0447\u0430\u0441 \u0432 \u043a\u0430\u0436\u0434\u043e\u0439 \u0438\u0437 \u043d\u0438\u0445 \u0438 \u043a\u0430\u043a \u0440\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0430.',
      }
    : adminSection === 'registrations'
      ? {
          eyebrow: '\u0417\u0430\u044f\u0432\u043a\u0438 \u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u0435',
          title: '\u0417\u0430\u044f\u0432\u043a\u0438 \u0432 \u043b\u0430\u0433\u0435\u0440\u044c \u0438 \u0438\u0445 \u0441\u0442\u0430\u0442\u0443\u0441\u044b',
          description: '\u042d\u0442\u043e\u0442 \u044d\u043a\u0440\u0430\u043d \u0441\u043e\u0431\u0440\u0430\u043d \u0434\u043b\u044f \u0441\u043f\u043e\u043a\u043e\u0439\u043d\u043e\u0439 \u0440\u0430\u0431\u043e\u0442\u044b \u0441 \u0430\u043d\u043a\u0435\u0442\u0430\u043c\u0438: \u0443\u0434\u043e\u0431\u043d\u043e \u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u0441\u0442\u0430\u0442\u0443\u0441\u044b, \u0438\u0441\u043a\u0430\u0442\u044c \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u0438 \u0431\u044b\u0441\u0442\u0440\u043e \u043f\u043e\u043d\u0438\u043c\u0430\u0442\u044c \u043e\u0431\u0449\u0443\u044e \u043a\u0430\u0440\u0442\u0438\u043d\u0443.',
        }
      : adminSection === 'users'
        ? {
            eyebrow: '\u0414\u043e\u0441\u0442\u0443\u043f \u0438 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438',
            title: '\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438, \u043f\u0440\u0430\u0432\u0430 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f',
            description: '\u0417\u0434\u0435\u0441\u044c \u0441\u043e\u0431\u0440\u0430\u043d\u044b \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u044b, \u0440\u043e\u043b\u0438, \u0432\u043d\u0435\u0448\u043d\u0438\u0435 \u0432\u0445\u043e\u0434\u044b \u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u044b \u0437\u0430\u044f\u0432\u043e\u043a, \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u0430\u0432\u0430 \u0431\u044b\u043b\u043e \u0443\u0434\u043e\u0431\u043d\u043e \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0431\u0435\u0437 \u0445\u0430\u043e\u0441\u0430.',
          }
        : {
            eyebrow: '\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435',
            title: '\u041f\u0430\u043d\u0435\u043b\u044c \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u043b\u0430\u0433\u0435\u0440\u0435\u043c',
            description: '\u0417\u0434\u0435\u0441\u044c \u0441\u043e\u0431\u0440\u0430\u043d \u043e\u0431\u0449\u0438\u0439 \u043e\u0431\u0437\u043e\u0440 \u043f\u043e \u0441\u0438\u0441\u0442\u0435\u043c\u0435: \u043a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0446\u0438\u0444\u0440\u044b, \u0440\u043e\u043b\u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u044b \u0438 \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u044b \u0432 \u043d\u0443\u0436\u043d\u044b\u0435 \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u0435 \u0440\u0430\u0437\u0434\u0435\u043b\u044b.',
          };

  return (
    <div className="page-stack">
      <header className="page-hero glass-card">
        <div>
          <p className="mini-eyebrow">{adminHeader.eyebrow}</p>
          <h2>{adminHeader.title}</h2>
          <p>{adminHeader.description}</p>
        </div>

        <div className="status-badge">
          <span>Ваш доступ</span>
          <strong>{formatRoleList(auth.account?.user.roles)}</strong>
        </div>
      </header>

      <section className="admin-nav-grid">
        <NavLink to="/admin" end className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u041e\u0431\u0437\u043e\u0440'}</p>
          <h3>{'\u0421\u0432\u043e\u0434\u043a\u0430 \u0438 \u0440\u043e\u043b\u0438'}</h3>
          <p>{'\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0446\u0438\u0444\u0440\u044b \u043f\u043e \u0441\u0438\u0441\u0442\u0435\u043c\u0435, \u0440\u043e\u043b\u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u044b \u0438 \u0431\u044b\u0441\u0442\u0440\u044b\u0435 \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u044b \u043a \u043e\u0441\u043d\u043e\u0432\u043d\u044b\u043c \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u0438\u0432\u043d\u044b\u043c \u0440\u0430\u0437\u0434\u0435\u043b\u0430\u043c.'}</p>
        </NavLink>

        <NavLink to="/admin/events" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u041c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f'}</p>
          <h3>{'\u0421\u043e\u0431\u044b\u0442\u0438\u044f \u0438 \u0432\u044b\u043f\u0443\u0441\u043a\u0438'}</h3>
          <p>{'\u041b\u0430\u0433\u0435\u0440\u044f \u043f\u043e \u0433\u043e\u0434\u0430\u043c, \u0440\u0435\u0442\u0440\u0438\u0442\u044b, \u043f\u043e\u0435\u0437\u0434\u043a\u0438 \u0438 \u0438\u0445 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438: \u0434\u0430\u0442\u044b, \u043b\u0438\u043c\u0438\u0442\u044b, \u0442\u0430\u0440\u0438\u0444\u044b, \u043a\u043e\u043d\u0442\u0435\u043d\u0442 \u0438 \u043e\u043a\u043d\u043e \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438.'}</p>
        </NavLink>

        <NavLink to="/admin/gallery" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u0413\u0430\u043b\u0435\u0440\u0435\u044f'}</p>
          <h3>{'\u0424\u0430\u0439\u043b\u044b \u0438 \u043c\u0435\u0434\u0438\u0430'}</h3>
          <p>{'\u0415\u0434\u0438\u043d\u0430\u044f \u043c\u0435\u0434\u0438\u0430\u0442\u0435\u043a\u0430 \u0434\u043b\u044f \u0444\u043e\u0442\u043e, \u0432\u0438\u0434\u0435\u043e \u0438 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432 \u0441 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u043e\u0439 \u043d\u0430 \u0441\u0435\u0440\u0432\u0435\u0440 \u0438 \u0433\u043e\u0442\u043e\u0432\u044b\u043c\u0438 URL \u0434\u043b\u044f \u0441\u0430\u0439\u0442\u0430.'}</p>
        </NavLink>

        <NavLink to="/admin/site" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u0421\u0430\u0439\u0442'}</p>
          <h3>{'\u0421\u043e\u0446\u0441\u0435\u0442\u0438 \u0438 \u0441\u0441\u044b\u043b\u043a\u0438'}</h3>
          <p>{'\u0428\u0430\u043f\u043a\u0430, \u043f\u043e\u0434\u0432\u0430\u043b \u0438 \u043e\u0444\u0438\u0446\u0438\u0430\u043b\u044c\u043d\u044b\u0435 \u043a\u0430\u043d\u0430\u043b\u044b \u043e\u0431\u0449\u0438\u043d\u044b: Telegram, VK, YouTube, сайт и другие внешние ссылки.'}</p>
        </NavLink>

        <NavLink to="/admin/telegram" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Telegram</p>
          <h3>Бот и рабочие чаты</h3>
          <p>Привязка групп к событиям, уведомления в команды, журнал команд и подготовка к Excel-выгрузкам прямо из Telegram.</p>
        </NavLink>

        <NavLink to="/admin/backups" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u0411\u044d\u043a\u0430\u043f\u044b'}</p>
          <h3>{'\u0411\u0430\u0437\u0430 \u0438 Telegram-\u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430'}</h3>
          <p>{'\u0420\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0434\u0430\u043c\u043f\u043e\u0432, \u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0441\u043d\u0438\u043c\u043a\u043e\u0432, \u0441\u043a\u0430\u0447\u0438\u0432\u0430\u043d\u0438\u0435 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u0431\u0430\u0437\u044b \u0430\u0434\u043c\u0438\u043d\u0430\u043c \u0447\u0435\u0440\u0435\u0437 Telegram-\u0431\u043e\u0442\u0430.'}</p>
        </NavLink>

        <NavLink to="/admin/users" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438'}</p>
          <h3>{'\u041f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u0438 \u0438 \u043f\u0440\u0430\u0432\u0430'}</h3>
          <p>{'\u0412\u0441\u0435 \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u044b \u0432 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435: \u0440\u043e\u043b\u0438, \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u044f\u0432\u043a\u0438, \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0435\u0435 \u043f\u043e\u0441\u0435\u0449\u0435\u043d\u0438\u0435 \u0438 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043e\u043c.'}</p>
        </NavLink>

        <NavLink to="/admin/registrations" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u0417\u0430\u044f\u0432\u043a\u0438'}</p>
          <h3>{'\u0410\u043d\u043a\u0435\u0442\u044b \u0438 \u0443\u0447\u0430\u0441\u0442\u0438\u0435'}</h3>
          <p>{'\u0421\u0442\u0430\u0442\u0443\u0441\u044b \u0430\u043d\u043a\u0435\u0442, \u043f\u043e\u0438\u0441\u043a \u043f\u043e \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0430\u043c \u0438 \u0431\u044b\u0441\u0442\u0440\u044b\u0439 \u043e\u0431\u0437\u043e\u0440 \u0442\u043e\u0433\u043e, \u0447\u0442\u043e \u0443\u0436\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043e \u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043e.'}</p>
        </NavLink>

        <NavLink to="/admin/roles" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u0420\u043e\u043b\u0438'}</p>
          <h3>{'\u041a\u043e\u043c\u0430\u043d\u0434\u0430 \u0438 \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0441\u0442\u044c'}</h3>
          <p>{'\u0421\u043e\u0441\u0442\u0430\u0432 \u0440\u043e\u043b\u0435\u0439, \u0440\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u043b\u044e\u0434\u0435\u0439 \u043f\u043e \u043d\u0438\u043c \u0438 \u0431\u043e\u043b\u0435\u0435 \u0441\u043f\u043e\u043a\u043e\u0439\u043d\u044b\u0439 \u043e\u0431\u0437\u043e\u0440 \u0437\u043e\u043d\u044b \u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0441\u0442\u0438 \u043a\u043e\u043c\u0430\u043d\u0434\u044b.'}</p>
        </NavLink>

        <NavLink to="/admin/auth" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Auth</p>
          <h3>{'\u041f\u0440\u043e\u0432\u0430\u0439\u0434\u0435\u0440\u044b \u0432\u0445\u043e\u0434\u0430'}</h3>
          <p>{'Google, VK, Yandex \u0438 Telegram \u0441 \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0430\u043c\u0438 \u043f\u043e \u043f\u043e\u043b\u044f\u043c, \u0434\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u043a\u043e\u0439 \u0438 \u0432\u0441\u0442\u0440\u043e\u0435\u043d\u043d\u043e\u0439 \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u043e\u0439.'}</p>
        </NavLink>
      </section>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <div className="glass-card stack-form">
          <p className="form-muted">Загружаем пользователей, роли и сводку по поездке...</p>
        </div>
      ) : overview ? (
        <>
          {adminSection === 'events' ? (
            <AdminEventsSection accessToken={auth.session?.accessToken ?? null} isActive />
          ) : null}

          {adminSection === 'gallery' ? (
            <AdminGallerySection accessToken={auth.session?.accessToken ?? null} isActive />
          ) : null}

          {adminSection === 'site' ? (
            <AdminSiteSettingsSection accessToken={auth.session?.accessToken ?? null} isActive />
          ) : null}

          {adminSection === 'telegram' ? (
            <AdminTelegramSection accessToken={auth.session?.accessToken ?? null} isActive />
          ) : null}

          {adminSection === 'backups' ? (
            <AdminBackupsSection accessToken={auth.session?.accessToken ?? null} isActive />
          ) : null}

          <section className="dashboard-grid admin-stats-grid" hidden={adminSection !== 'overview'}>
            <article className="glass-card metric-card">
              <p>Пользователи</p>
              <strong>{overview.stats.totalUsers}</strong>
              <span>Всего аккаунтов в системе</span>
            </article>

            <article className="glass-card metric-card">
              <p>Анкеты</p>
              <strong>{overview.stats.totalRegistrations}</strong>
              <span>Создано регистраций на поездку</span>
            </article>

            <article className="glass-card metric-card">
              <p>Отправлено</p>
              <strong>{overview.stats.submittedRegistrations}</strong>
              <span>Анкет ожидают обработки</span>
            </article>

            <article className="glass-card metric-card">
              <p>Подтверждено</p>
              <strong>{overview.stats.confirmedRegistrations}</strong>
              <span>Участие уже подтверждено командой</span>
            </article>
          </section>

          <section className="role-grid" hidden={adminSection !== 'overview' && adminSection !== 'roles'}>
            {overview.roles.map((role) => (
              <article className="glass-card role-card" key={role.id}>
                <p className="mini-eyebrow">Роль</p>
                <h3>{role.title}</h3>
                <p>{role.description}</p>
              </article>
            ))}
          </section>

          <section className="glass-card stack-form" hidden={adminSection !== 'roles'}>
            <div className="section-inline">
              <div>
                <p className="mini-eyebrow">Роли</p>
                <h3>Состав команды по ролям</h3>
              </div>
              <p className="form-muted">
                Здесь видно, сколько людей сейчас в каждой роли и кто именно входит в этот контур ответственности.
              </p>
            </div>

            <div className="admin-nav-grid">
              {overview.roles.map((role) => {
                const usersInRole = role.memberDisplayNames;

                return (
                  <article className="glass-card admin-nav-card" key={role.id}>
                    <p className="mini-eyebrow">{role.title}</p>
                    <h3>{role.assignedUserCount}</h3>
                    <p>{role.description}</p>
                    <div className="role-pills">
                      {usersInRole.length ? (
                        usersInRole.map((memberName) => (
                          <span className="role-pill" key={`${role.id}-${memberName}`}>
                            {memberName}
                          </span>
                        ))
                      ) : (
                        <span className="role-pill muted-pill">Пока никого нет</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="glass-card stack-form" hidden={adminSection !== 'registrations'}>
            <div className="section-inline">
              <div>
                <p className="mini-eyebrow">Заявки</p>
                <h3>Анкеты и статусы участия</h3>
              </div>
              <p className="form-muted">
                Здесь собраны только те пользователи, у которых уже есть анкета или статус участия.
              </p>
            </div>

            <div className="admin-filter-bar">
              <label>
                <span>Поиск</span>
                <input
                  value={registrationSearch}
                  onChange={(event) => {
                    setRegistrationSearch(event.target.value);
                    setRegistrationPage(1);
                  }}
                  placeholder="Имя, email, город или церковь"
                />
              </label>

              <label>
                <span>Статус</span>
                <select
                  value={registrationStatusFilter}
                  onChange={(event) => {
                    setRegistrationStatusFilter(event.target.value as 'all' | RegistrationStatus);
                    setRegistrationPage(1);
                  }}
                >
                  <option value="all">Все статусы</option>
                  <option value="Draft">Черновик</option>
                  <option value="Submitted">Отправлено</option>
                  <option value="Confirmed">Подтверждено</option>
                  <option value="Cancelled">Отменено</option>
                </select>
              </label>

              <label>
                <span>Мероприятие</span>
                <select
                  value={registrationEventFilter}
                  onChange={(event) => {
                    setRegistrationEventFilter(event.target.value);
                    setRegistrationPage(1);
                  }}
                >
                  <option value="all">Все мероприятия</option>
                  {adminEvents.map((eventItem) => (
                    <option key={eventItem.id} value={eventItem.id}>
                      {eventItem.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="role-pills">
              <span className="role-pill">Анкет найдено: {registrationsPage?.totalItems ?? 0}</span>
              <span className="role-pill muted-pill">На этой странице: {filteredRegistrations.length}</span>
            </div>

            {registrationsPage ? (
              <PaginationBar
                page={registrationsPage.page}
                pageSize={registrationsPage.pageSize}
                totalItems={registrationsPage.totalItems}
                totalPages={registrationsPage.totalPages}
                isLoading={isRegistrationsLoading}
                onPageChange={setRegistrationPage}
                onPageSizeChange={(nextPageSize) => {
                  setRegistrationPageSize(nextPageSize);
                  setRegistrationPage(1);
                }}
              />
            ) : null}

            <div className="user-list">
              {isRegistrationsLoading && !registrationsPage ? (
                <article className="user-card admin-empty-state">
                  <strong className="user-name">Загружаем анкеты</strong>
                  <p className="form-muted">Собираем страницу заявок и готовим фильтры.</p>
                </article>
              ) : null}

              {filteredRegistrations.map((user) => {
                const draftRegistrationStatus = getDraftRegistrationStatus(user);
                const isSavingThisRegistration = savingRegistrationId === user.registrationId;
                const isRegistrationDirty = Boolean(
                  user.registrationId &&
                  user.registrationStatus &&
                  draftRegistrationStatus !== user.registrationStatus,
                );
                const registrationParticipants = user.registrationParticipants ?? [];
                const registrationPrice = user.registrationSelectedPriceOptionTitle
                  ? `${user.registrationSelectedPriceOptionTitle} • ${formatMoney(
                      user.registrationSelectedPriceOptionAmount,
                      user.registrationSelectedPriceOptionCurrency || 'RUB',
                    )}`
                  : '\u041d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d';

                return (
                <article className="user-card" key={`registration-${user.registrationId ?? user.id}`}>
                  <div className="user-card-head">
                    <div>
                      <strong className="user-name">{user.displayName}</strong>
                      <p className="user-meta">
                        {user.email}
                        {user.registrationEventTitle ? ` • ${user.registrationEventTitle}` : ''}
                      </p>
                    </div>

                    <div className="role-pills">
                      <span className="role-pill">{formatStatus(draftRegistrationStatus)}</span>
                    </div>
                  </div>

                  <div className="user-info-grid">
                    <div>
                      <span>Город</span>
                      <strong>{user.city || 'Не указан'}</strong>
                    </div>
                    <div>
                      <span>Церковь</span>
                      <strong>{user.churchName || 'Не указана'}</strong>
                    </div>
                    <div>
                      <span>Роли</span>
                      <strong>{formatRoleList(user.roles)}</strong>
                    </div>
                    <div>
                      <span>Последний вход</span>
                      <strong>{formatDateTime(user.lastLoginAtUtc)}</strong>
                    </div>
                  </div>

                  {user.registrationId ? (
                    <details className="registration-details">
                      <summary>
                        <span>Полная анкета</span>
                        <small>Обновлена: {formatDateTime(user.registrationUpdatedAtUtc)}</small>
                      </summary>

                      <div className="registration-detail-grid">
                        <div>
                          <span>Мероприятие</span>
                          <strong>{formatOptional(user.registrationEventTitle, 'Не указано')}</strong>
                        </div>
                        <div>
                          <span>Статус</span>
                          <strong>{formatStatus(draftRegistrationStatus)}</strong>
                        </div>
                        <div>
                          <span>Тариф</span>
                          <strong>{registrationPrice}</strong>
                        </div>
                        <div>
                          <span>Email заявки</span>
                          <strong>{formatOptional(user.registrationContactEmail)}</strong>
                        </div>
                        <div>
                          <span>ФИО основного участника</span>
                          <strong>{formatOptional(user.registrationFullName)}</strong>
                        </div>
                        <div>
                          <span>Дата рождения</span>
                          <strong>{formatDateOnly(user.registrationBirthDate)}</strong>
                        </div>
                        <div>
                          <span>Телефон</span>
                          <strong>{formatOptional(user.registrationPhoneNumber)}</strong>
                        </div>
                        <div>
                          <span>Телефон подтверждён</span>
                          <strong>{formatYesNo(user.registrationPhoneNumberConfirmed)}</strong>
                        </div>
                        <div>
                          <span>Город</span>
                          <strong>{formatOptional(user.city)}</strong>
                        </div>
                        <div>
                          <span>Церковь</span>
                          <strong>{formatOptional(user.churchName)}</strong>
                        </div>
                        <div>
                          <span>Размещение</span>
                          <strong>{formatAccommodationPreference(user.registrationAccommodationPreference)}</strong>
                        </div>
                        <div>
                          <span>Автомобиль</span>
                          <strong>{formatYesNo(user.registrationHasCar)}</strong>
                        </div>
                        <div>
                          <span>Едет с детьми</span>
                          <strong>{formatYesNo(user.registrationHasChildren)}</strong>
                        </div>
                        <div>
                          <span>Доверенное лицо</span>
                          <strong>{formatOptional(user.registrationEmergencyContactName)}</strong>
                        </div>
                        <div>
                          <span>Телефон доверенного лица</span>
                          <strong>{formatOptional(user.registrationEmergencyContactPhone)}</strong>
                        </div>
                        <div>
                          <span>Согласие на обработку</span>
                          <strong>{formatYesNo(user.registrationConsentAccepted)}</strong>
                        </div>
                        <div>
                          <span>Создана</span>
                          <strong>{formatDateTime(user.registrationCreatedAtUtc)}</strong>
                        </div>
                        <div>
                          <span>Отправлена</span>
                          <strong>{formatDateTime(user.registrationSubmittedAtUtc)}</strong>
                        </div>
                      </div>

                      <div className="registration-detail-section">
                        <div className="section-inline compact-inline">
                          <strong>Участники</strong>
                          <span className="role-pill muted-pill">
                            Всего: {user.registrationParticipantsCount ?? registrationParticipants.length}
                          </span>
                        </div>
                        <div className="registration-participant-list">
                          {registrationParticipants.length ? (
                            registrationParticipants.map((participant) => (
                              <div key={`${user.registrationId}-${participant.sortOrder}`}>
                                <strong>{participant.fullName}</strong>
                                <span>{participant.isChild ? 'Ребёнок' : 'Взрослый'}</span>
                              </div>
                            ))
                          ) : (
                            <p className="form-muted">Участники не указаны.</p>
                          )}
                        </div>
                      </div>

                      <div className="registration-notes-grid">
                        <div>
                          <span>Здоровье и ограничения</span>
                          <p>{formatOptional(user.registrationHealthNotes, 'Нет данных')}</p>
                        </div>
                        <div>
                          <span>Аллергии</span>
                          <p>{formatOptional(user.registrationAllergyNotes, 'Нет данных')}</p>
                        </div>
                        <div>
                          <span>Особые условия</span>
                          <p>{formatOptional(user.registrationSpecialNeeds, 'Нет данных')}</p>
                        </div>
                        <div>
                          <span>Комментарий</span>
                          <p>{formatOptional(user.registrationMotivation, 'Нет данных')}</p>
                        </div>
                      </div>
                    </details>
                  ) : null}

                  {user.registrationId ? (
                    <div className="action-row">
                      <label style={{ minWidth: 220 }}>
                        <span>Статус заявки</span>
                        <select
                          value={draftRegistrationStatus}
                          onChange={(event) =>
                            setRegistrationStatusDrafts((current) => ({
                              ...current,
                              [user.registrationId as string]: event.target.value as RegistrationStatus,
                            }))
                          }
                          disabled={isSavingThisRegistration}
                        >
                          <option value="Draft">Черновик</option>
                          <option value="Submitted">Отправлено</option>
                          <option value="Confirmed">Подтверждено</option>
                          <option value="Cancelled">Отменено</option>
                        </select>
                      </label>

                      <button
                        className="primary-button"
                        type="button"
                        onClick={async () => saveRegistrationStatus(user)}
                        disabled={isSavingThisRegistration || !isRegistrationDirty}
                      >
                        {isSavingThisRegistration ? 'Сохраняем...' : 'Сохранить статус'}
                      </button>
                    </div>
                  ) : null}
                </article>
                );
              })}

              {!filteredRegistrations.length && !isRegistrationsLoading ? (
                <article className="user-card admin-empty-state">
                  <strong className="user-name">Подходящих анкет не найдено</strong>
                  <p className="form-muted">Попробуйте изменить строку поиска или выбрать другой статус.</p>
                </article>
              ) : null}
            </div>
          </section>

          {!authSettings && adminSection === 'auth' && isAuthLoading ? (
            <section className="glass-card stack-form">
              <p className="form-muted">Загружаем настройки и журнал внешней авторизации...</p>
            </section>
          ) : null}

          {authSettings ? (
            <section className="glass-card stack-form" hidden={adminSection !== 'auth'}>
              <div className="section-inline">
                <div>
                  <p className="mini-eyebrow">Auth providers</p>
                  <h3>Внешняя авторизация</h3>
                </div>
                <p className="form-muted">
                  Здесь включаются Google, VK, Yandex и Telegram, а также задаются callback и webhook параметры.
                </p>
              </div>

              <div className="user-list">
                {authSettings.providers.map((provider) => {
                  const draft = getProviderDraft(provider);
                  const isSavingThisProvider = savingProvider === provider.provider;
                  const isTestingThisProvider = testingProvider === provider.provider;

                  return (
                    <article className="user-card" key={provider.provider}>
                      <div className="user-card-head">
                        <div>
                          <strong className="user-name">{provider.displayName}</strong>
                          <p className="user-meta">
                            {provider.mode === 'telegram' ? 'Telegram bot, widget и webhook' : 'OAuth 2.0'}
                          </p>
                        </div>

                        <div className="role-pills">
                          <span className={`role-pill ${provider.ready ? '' : 'muted-pill'}`}>
                            {provider.ready ? 'Готов' : 'Не готов'}
                          </span>
                        </div>
                      </div>

                      <div className="form-grid">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.enabled)}
                            onChange={(event) => updateProviderDraft(provider.provider, { enabled: event.target.checked })}
                          />
                          <span>Включить {provider.displayName}</span>
                        </label>

                        {provider.mode === 'oauth' ? (
                          <>
                            <label>
                              <span>Client ID</span>
                              <input
                                value={draft.clientId ?? ''}
                                onChange={(event) => updateProviderDraft(provider.provider, { clientId: event.target.value })}
                                placeholder="client id"
                              />
                            </label>

                            <label>
                              <span>Client Secret</span>
                              <input
                                value={draft.clientSecret ?? ''}
                                onChange={(event) => updateProviderDraft(provider.provider, { clientSecret: event.target.value })}
                                placeholder={provider.clientSecretMasked || 'Оставьте пустым, чтобы не менять'}
                              />
                            </label>
                          </>
                        ) : (
                          <>
                            <label className="checkbox-row">
                              <input
                                type="checkbox"
                                checked={Boolean(draft.widgetEnabled)}
                                onChange={(event) => updateProviderDraft(provider.provider, { widgetEnabled: event.target.checked })}
                              />
                              <span>Разрешить Telegram Widget</span>
                            </label>

                            <label>
                              <span>Bot username</span>
                              <input
                                value={draft.botUsername ?? ''}
                                onChange={(event) => updateProviderDraft(provider.provider, { botUsername: event.target.value })}
                                placeholder="@blagodaty_login_bot"
                              />
                            </label>

                            <label>
                              <span>Bot token</span>
                              <input
                                value={draft.botToken ?? ''}
                                onChange={(event) => updateProviderDraft(provider.provider, { botToken: event.target.value })}
                                placeholder={provider.botTokenMasked || 'Оставьте пустым, чтобы не менять'}
                              />
                            </label>

                            <label>
                              <span>Webhook secret</span>
                              <input
                                value={draft.webhookSecret ?? ''}
                                onChange={(event) => updateProviderDraft(provider.provider, { webhookSecret: event.target.value })}
                                placeholder={provider.webhookSecretMasked || 'Секрет для X-Telegram-Bot-Api-Secret-Token'}
                              />
                            </label>
                          </>
                        )}
                      </div>

                      <div className="user-info-grid">
                        {provider.callbackUrl ? (
                          <div>
                            <span>Callback URL</span>
                            <strong>{provider.callbackUrl}</strong>
                          </div>
                        ) : null}
                        {provider.webhookUrl ? (
                          <div>
                            <span>Webhook URL</span>
                            <strong>{provider.webhookUrl}</strong>
                          </div>
                        ) : null}
                      </div>

                      {provider.hints.length ? (
                        <div className="provider-help-block">
                          <span className="provider-help-title">Что заполнить</span>
                          <ul className="provider-hint-list">
                            {provider.hints.map((hint) => (
                              <li key={hint}>{hint}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {provider.diagnostics.length ? (
                        <div className="provider-diagnostics-grid">
                          {provider.diagnostics.map((diagnostic) => (
                            <article
                              className={`diagnostic-card ${diagnostic.ok ? 'diagnostic-ok' : 'diagnostic-warn'}`}
                              key={`${provider.provider}-${diagnostic.key}`}
                            >
                              <strong>{diagnostic.title}</strong>
                              <p>{diagnostic.message || (diagnostic.ok ? 'Проверка пройдена.' : 'Требуется настройка.')}</p>
                            </article>
                          ))}
                        </div>
                      ) : null}

                      <div className="action-row">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={isSavingThisProvider || isTestingThisProvider || !provider.ready}
                          onClick={async () => startProviderTest(provider)}
                        >
                          {isTestingThisProvider ? 'Проверяем...' : 'Проверить'}
                        </button>

                        <button
                          className="primary-button"
                          type="button"
                          disabled={isSavingThisProvider || isTestingThisProvider}
                          onClick={async () => saveProvider(provider)}
                        >
                          {isSavingThisProvider ? 'Сохраняем...' : 'Сохранить настройки'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="user-list">
                {authSettings.recentEvents.map((event) => (
                  <article className="user-card" key={event.id}>
                    <div className="user-card-head">
                      <div>
                        <strong className="user-name">{formatProviderLabel(event.provider)}</strong>
                        <p className="user-meta">{event.eventType}</p>
                      </div>
                      <div className="role-pills">
                        <span className="role-pill">{formatDateTime(event.createdAtUtc)}</span>
                      </div>
                    </div>
                    <p className="form-muted">{event.detail || 'Служебное событие внешней авторизации'}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="glass-card stack-form" hidden={adminSection !== 'users'}>
            <div className="section-inline">
              <div>
                <p className="mini-eyebrow">Пользователи</p>
                <h3>Аккаунты, роли и доступ</h3>
              </div>
              <p className="form-muted">
                Последний администратор защищен от случайного снятия прав. Здесь можно искать людей, фильтровать по ролям и спокойно править доступ.
              </p>
            </div>

            <div className="admin-filter-bar">
              <label>
                <span>Поиск</span>
                <input
                  value={userSearch}
                  onChange={(event) => {
                    setUserSearch(event.target.value);
                    setUserPage(1);
                  }}
                  placeholder="Имя, email, город или церковь"
                />
              </label>

              <label>
                <span>Роль</span>
                <select
                  value={userRoleFilter}
                  onChange={(event) => {
                    setUserRoleFilter(event.target.value as 'all' | AppRole);
                    setUserPage(1);
                  }}
                >
                  <option value="all">Все роли</option>
                  <option value="Member">Участник</option>
                  <option value="CampManager">Координатор лагеря</option>
                  <option value="Admin">Администратор</option>
                </select>
              </label>
            </div>

            <div className="role-pills">
              <span className="role-pill">Найдено: {usersPage?.totalItems ?? 0}</span>
              <span className="role-pill muted-pill">На этой странице: {filteredUsers.length}</span>
            </div>

            {usersPage ? (
              <PaginationBar
                page={usersPage.page}
                pageSize={usersPage.pageSize}
                totalItems={usersPage.totalItems}
                totalPages={usersPage.totalPages}
                isLoading={isUsersLoading}
                onPageChange={setUserPage}
                onPageSizeChange={(nextPageSize) => {
                  setUserPageSize(nextPageSize);
                  setUserPage(1);
                }}
              />
            ) : null}

            <div className="user-list">
              {isUsersLoading && !usersPage ? (
                <article className="user-card admin-empty-state">
                  <strong className="user-name">Загружаем пользователей</strong>
                  <p className="form-muted">Собираем страницу аккаунтов и применяем фильтры.</p>
                </article>
              ) : null}

              {filteredUsers.map((user) => {
                const draftRoles = getDraftRoles(user);
                const isDirty = !rolesEqual(draftRoles, orderRoles([...user.roles]));
                const isSavingThisUser = savingUserId === user.id;

                return (
                  <article className="user-card" key={user.id}>
                    <div className="user-card-head">
                      <div>
                        <strong className="user-name">{user.displayName}</strong>
                        <p className="user-meta">
                          {user.email}
                          {user.registrationEventTitle ? ` • ${user.registrationEventTitle}` : ''}
                        </p>
                      </div>

                      <div className="role-pills">
                        {draftRoles.length ? (
                          draftRoles.map((role) => (
                            <span className="role-pill" key={role}>
                              {formatRoleLabel(role)}
                            </span>
                          ))
                        ) : (
                          <span className="role-pill muted-pill">Без роли</span>
                        )}
                      </div>
                    </div>

                    <div className="user-info-grid">
                      <div>
                        <span>Город</span>
                        <strong>{user.city || 'Не указан'}</strong>
                      </div>
                      <div>
                        <span>Церковь</span>
                        <strong>{user.churchName || 'Не указана'}</strong>
                      </div>
                      <div>
                        <span>Заявка</span>
                        <strong>{formatStatus(user.registrationStatus)}</strong>
                      </div>
                      <div>
                        <span>Последний вход</span>
                        <strong>{formatDateTime(user.lastLoginAtUtc)}</strong>
                      </div>
                    </div>

                    <div className="role-pills">
                      {user.externalIdentities.length ? (
                        user.externalIdentities.map((identity) => (
                          <span className="role-pill muted-pill" key={`${user.id}-${identity.provider}`}>
                            {formatProviderLabel(identity.provider)}
                          </span>
                        ))
                      ) : (
                        <span className="role-pill muted-pill">Без внешних входов</span>
                      )}
                    </div>

                    <div className="role-editor">
                      {overview.roles.map((role) => (
                        <label className="role-toggle" key={role.id}>
                          <input
                            type="checkbox"
                            checked={draftRoles.includes(role.id)}
                            onChange={(event) => toggleRole(user, role.id, event.target.checked)}
                            disabled={isSavingThisUser}
                          />
                          <div>
                            <strong>{role.title}</strong>
                            <span>{role.description}</span>
                          </div>
                        </label>
                      ))}
                    </div>

                    <div className="action-row">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => resetRoles(user)}
                        disabled={isSavingThisUser || !isDirty}
                      >
                        Сбросить
                      </button>

                      <button
                        className="primary-button"
                        type="button"
                        onClick={async () => saveRoles(user)}
                        disabled={isSavingThisUser || !isDirty}
                      >
                        {isSavingThisUser ? 'Сохраняем...' : 'Сохранить права'}
                      </button>
                    </div>
                  </article>
                );
              })}

              {!filteredUsers.length && !isUsersLoading ? (
                <article className="user-card admin-empty-state">
                  <strong className="user-name">Пользователи не найдены</strong>
                  <p className="form-muted">Попробуйте изменить строку поиска или сбросить фильтр по ролям.</p>
                </article>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <div className="glass-card stack-form">
          <p className="form-muted">Пока не удалось получить админские данные.</p>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { isReady } = useAuth();

  if (!isReady) {
    return <AppLoader />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingGate />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/camp-registration" element={<CampRegistrationFlowPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/access" element={<AdminPage />} />
        <Route path="/admin/events" element={<AdminPage />} />
        <Route path="/admin/gallery" element={<AdminPage />} />
        <Route path="/admin/site" element={<AdminPage />} />
        <Route path="/admin/telegram" element={<AdminPage />} />
        <Route path="/admin/backups" element={<AdminPage />} />
        <Route path="/admin/users" element={<AdminPage />} />
        <Route path="/admin/registrations" element={<AdminPage />} />
        <Route path="/admin/roles" element={<AdminPage />} />
        <Route path="/admin/auth" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
