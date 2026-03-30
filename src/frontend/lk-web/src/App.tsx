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
  ApiError,
  getAdminExternalAuthSettings,
  getAdminEvents,
  getAdminOverview,
  getAdminRegistrations,
  getAdminUsers,
  getExternalAuthStatus,
  getPublicEvent,
  getPublicEvents,
  getPublicExternalAuthProviders,
  getTelegramAuthStatus,
  loginWithTelegramWidget,
  startAdminExternalAuthProviderTest,
  startExternalAuth,
  startTelegramAuth,
  unlinkExternalIdentity,
  updateAdminExternalAuthProvider,
  updateUserRoles,
} from './lib/api';
import { AdminEventsSection } from './admin/AdminEventsSection';
import { useToast } from './ui/ToastProvider';
import type {
  AccommodationPreference,
  AccountRegistrationSummary,
  AdminExternalAuthProvider,
  AdminExternalAuthSettings,
  AdminEventDetails,
  AdminEventSummary,
  AdminOverview,
  AdminRoleDefinition,
  AdminUser,
  AppRole,
  CampRegistration,
  EventContentBlockType,
  EventEditionStatus,
  EventKind,
  EventScheduleItemKind,
  ExternalAuthStartResponse,
  ExternalIdentity,
  PaginatedResponse,
  PublicEventDetails,
  PublicEventSummary,
  PublicExternalAuthProvider,
  RegistrationStatus,
  SaveRegistrationRequest,
  UpsertAdminEventContentBlockRequest,
  UpsertAdminEventPriceOptionRequest,
  UpsertAdminEventRequest,
  UpsertAdminEventScheduleItemRequest,
  UpdateProfileRequest,
  UpdateExternalAuthProviderRequest,
} from './types';

const roleLabels: Record<AppRole, string> = {
  Member: 'Участник',
  CampManager: 'Координатор лагеря',
  Admin: 'Администратор',
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
  Camp: 'Лагерь',
  Conference: 'Конференция',
  Retreat: 'Ретрит',
  Trip: 'Поездка',
  Other: 'Другое',
};

const eventStatusLabels: Record<EventEditionStatus, string> = {
  Draft: 'Черновик',
  Published: 'Опубликовано',
  RegistrationOpen: 'Регистрация открыта',
  RegistrationClosed: 'Регистрация закрыта',
  InProgress: 'Идёт сейчас',
  Completed: 'Завершено',
  Archived: 'Архив',
};

const scheduleKindLabels: Record<EventScheduleItemKind, string> = {
  Arrival: 'Заезд',
  MainProgram: 'Основная программа',
  Departure: 'Выезд',
  Meeting: 'Встреча',
  Deadline: 'Дедлайн',
  Other: 'Другое',
};

const contentBlockLabels: Record<EventContentBlockType, string> = {
  Hero: 'Главный блок',
  About: 'О мероприятии',
  Highlight: 'Акценты',
  WhatToBring: 'Что взять',
  Program: 'Программа',
  ImportantNotice: 'Важное',
  Faq: 'Вопросы и ответы',
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
    return 'Без роли';
  }

  return roles.map(formatRoleLabel).join(' • ');
}

function formatStatus(status?: RegistrationStatus | null) {
  switch (status) {
    case 'Submitted':
      return 'Анкета отправлена';
    case 'Confirmed':
      return 'Участие подтверждено';
    case 'Cancelled':
      return 'Заявка отменена';
    case 'Draft':
      return 'Черновик сохранен';
    default:
      return 'Заявка еще не заполнена';
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Пока нет';
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
    return 'Даты пока не указаны';
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
    return 'По запросу';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
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
  registrations: AccountRegistrationSummary[],
  requestedSlug?: string | null,
) {
  if (requestedSlug && events.some((event) => event.slug === requestedSlug)) {
    return requestedSlug;
  }

  const existingRegistrationSlug = registrations.find((item) => item.eventSlug)?.eventSlug;
  if (existingRegistrationSlug && events.some((event) => event.slug === existingRegistrationSlug)) {
    return existingRegistrationSlug;
  }

  return events.find((event) => event.isRegistrationOpen)?.slug ?? events[0]?.slug ?? null;
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
  return <Navigate replace to={isAuthenticated ? '/dashboard' : '/login'} />;
}

function ProtectedLayout() {
  const { isAuthenticated, account, logout } = useAuth();
  const navigate = useNavigate();
  const canOpenAdmin = isAdmin(account?.user.roles);

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return (
    <div className="screen-shell dashboard-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <aside className="sidebar">
        <div>
          <p className="mini-eyebrow">Blagodaty</p>
          <h1>Личный кабинет</h1>
          <p className="sidebar-copy">
            Центр для регистрации на поездку, обновления профиля, работы с анкетой и дальнейшей
            связи с командой лагеря.
          </p>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard">Обзор</NavLink>
          <NavLink to="/profile">Профиль</NavLink>
          <NavLink to="/camp-registration">Мероприятия и заявки</NavLink>
          {canOpenAdmin ? <NavLink to="/admin">Администрирование</NavLink> : null}
          <a href={campBaseUrl} target="_blank" rel="noreferrer">
            Открыть camp-сайт
          </a>
        </nav>

        <div className="sidebar-footer">
          <p>{account?.user.displayName ?? 'Участник'}</p>
          <span className="sidebar-role">{formatRoleList(account?.user.roles)}</span>
          <button
            className="ghost-button"
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Выйти
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
      navigate('/dashboard', { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

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
        navigate('/dashboard', { replace: true, state: { from: location.pathname } });
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
  }, [auth, location.pathname, mode, navigate, telegramProvider?.botUsername, telegramProvider?.widgetEnabled]);

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
          navigate(response.returnUrl || '/dashboard', { replace: true, state: { from: location.pathname } });
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
  }, [auth, location.pathname, navigate, pendingExternalAuth]);

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

      navigate('/dashboard', { replace: true, state: { from: location.pathname } });
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
        returnUrl: '/dashboard',
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
        returnUrl: '/dashboard',
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
            <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>
              Вход
            </NavLink>
            <NavLink to="/register" className={({ isActive }) => (isActive ? 'active' : '')}>
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

function DashboardPageLegacy() {
  const { account } = useAuth();
  const canOpenAdmin = isAdmin(account?.user.roles);

  return (
    <div className="page-stack">
      <header className="page-hero glass-card">
        <div>
          <p className="mini-eyebrow">Обзор</p>
          <h2>Здравствуйте, {account?.user.displayName}</h2>
          <p>
            Это первый рабочий контур кабинета: здесь видно статус заявки, профиль участника и
            будущий контур для взаимодействия с командой поездки.
          </p>
        </div>

        <div className="status-badge">
          <span>Статус</span>
          <strong>{formatStatus(account?.registration?.status)}</strong>
        </div>
      </header>

      <section className="dashboard-grid">
        <article className="glass-card metric-card">
          <p>Аккаунт</p>
          <strong>{account?.user.email}</strong>
          <span>Роль: {formatRoleList(account?.user.roles)}</span>
        </article>

        <article className="glass-card metric-card">
          <p>Профиль</p>
          <strong>{account?.user.city || 'Пока без города'}</strong>
          <span>Обновите профиль, чтобы организаторам было проще связаться с вами.</span>
        </article>

        <article className="glass-card metric-card">
          <p>Заявка на camp</p>
          <strong>{account?.registration ? 'Есть' : 'Пока нет'}</strong>
          <span>Анкету можно сохранить как черновик или сразу отправить команде лагеря.</span>
        </article>
      </section>

      <section className="glass-card callout-card">
        <p className="mini-eyebrow">Следующее действие</p>
        <h3>Сначала заполните профиль, затем анкету в лагерь</h3>
        <p>
          Такой порядок помогает не дублировать данные и делает дальнейшую админскую работу
          заметно чище.
        </p>
        <div className="inline-links">
          <NavLink to="/profile">Открыть профиль</NavLink>
          <NavLink to="/camp-registration">Перейти к анкете</NavLink>
          {canOpenAdmin ? <NavLink to="/admin">Открыть админку</NavLink> : null}
        </div>
      </section>
    </div>
  );
}

void DashboardPageLegacy;

function DashboardPage() {
  const { account } = useAuth();
  const canOpenAdmin = isAdmin(account?.user.roles);
  const registrations = account?.registrations ?? [];
  const nextRegistration = registrations[0] ?? null;
  const primaryRegistrationLink = nextRegistration?.eventSlug
    ? `/camp-registration?event=${nextRegistration.eventSlug}`
    : '/camp-registration';

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

      <section className="dashboard-grid">
        <article className="glass-card metric-card">
          <p>Аккаунт</p>
          <strong>{account?.user.email}</strong>
          <span>Роль: {formatRoleList(account?.user.roles)}</span>
        </article>

        <article className="glass-card metric-card">
          <p>Профиль</p>
          <strong>{account?.user.city || 'Пока без города'}</strong>
          <span>Обновите профиль, чтобы команде было проще связаться с вами по любому мероприятию.</span>
        </article>

        <article className="glass-card metric-card">
          <p>Мои заявки</p>
          <strong>{registrations.length}</strong>
          <span>Можно вести несколько мероприятий: лагерь по сезонам, ретриты и другие события.</span>
        </article>

        <article className="glass-card metric-card">
          <p>Следующее мероприятие</p>
          <strong>{nextRegistration?.eventTitle || 'Пока не выбрано'}</strong>
          <span>
            {nextRegistration
              ? formatDateRangeCompact(nextRegistration.eventStartsAtUtc, nextRegistration.eventEndsAtUtc)
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
                  <NavLink to={`/camp-registration?event=${registration.eventSlug || ''}`}>Открыть заявку</NavLink>
                </div>
              </article>
            ))
          ) : (
            <article className="user-card admin-empty-state">
              <strong className="user-name">Пока нет ни одной заявки</strong>
              <p className="form-muted">
                Откройте список мероприятий, выберите нужное событие и сохраните анкету как черновик или отправьте ее сразу.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className="glass-card callout-card">
        <p className="mini-eyebrow">Следующее действие</p>
        <h3>Сначала обновите профиль, затем выберите нужное мероприятие и заполните анкету</h3>
        <p>Такой порядок помогает не дублировать данные и делает дальнейшую административную работу заметно чище.</p>
        <div className="inline-links">
          <NavLink to="/profile">Открыть профиль</NavLink>
          <NavLink to={primaryRegistrationLink}>Перейти к мероприятиям</NavLink>
          {canOpenAdmin ? <NavLink to="/admin">Открыть админку</NavLink> : null}
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
  }, [account]);

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

function CampRegistrationPageLegacy() {
  const auth = useAuth();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<CampRegistration | null>(null);
  const [form, setForm] = useState<SaveRegistrationRequest>({
    fullName: '',
    birthDate: '',
    city: '',
    churchName: '',
    phoneNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Either',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: false,
  });

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const loaded = await auth.loadRegistration();
      setRegistration(loaded);

      if (loaded) {
        setForm({
          fullName: loaded.fullName,
          birthDate: loaded.birthDate,
          city: loaded.city,
          churchName: loaded.churchName,
          phoneNumber: loaded.phoneNumber,
          emergencyContactName: loaded.emergencyContactName,
          emergencyContactPhone: loaded.emergencyContactPhone,
          accommodationPreference: loaded.accommodationPreference,
          healthNotes: loaded.healthNotes ?? '',
          allergyNotes: loaded.allergyNotes ?? '',
          specialNeeds: loaded.specialNeeds ?? '',
          motivation: loaded.motivation ?? '',
          consentAccepted: loaded.consentAccepted,
          submit: false,
        });
      } else if (auth.account) {
        const { user } = auth.account;

        setForm((current) => ({
          ...current,
          fullName: `${user.firstName} ${user.lastName}`.trim(),
          city: user.city ?? '',
          churchName: user.churchName ?? '',
          phoneNumber: user.phoneNumber ?? '',
        }));
      }
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить анкету.';
      setError(nextError);
      toast.error('Не удалось загрузить анкету', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  async function submit(submitMode: boolean) {
    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      const saved = await auth.saveRegistration({
        ...form,
        submit: submitMode,
      });
      setRegistration(saved);
      const successMessage = submitMode ? 'Анкета отправлена команде.' : 'Черновик сохранен.';
      setMessage(successMessage);
      toast.success(submitMode ? 'Анкета отправлена' : 'Черновик сохранен', successMessage);
    } catch (submitError) {
      const nextError =
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : 'Не удалось сохранить анкету.';
      setError(nextError);
      toast.error('Не удалось сохранить анкету', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-hero glass-card compact-hero">
        <div>
          <p className="mini-eyebrow">Camp registration</p>
          <h2>Анкета участника на поездку в Алтай</h2>
          <p>Сохраняйте как черновик или отправляйте, когда все данные заполнены.</p>
        </div>

        <div className="status-badge">
          <span>Текущий статус</span>
          <strong>{formatStatus(registration?.status)}</strong>
        </div>
      </header>

      <div className="glass-card stack-form">
        {isLoading ? (
          <p className="form-muted">Загружаем текущую анкету...</p>
        ) : (
          <>
            <div className="form-grid">
              <label>
                <span>Имя и фамилия</span>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Дата рождения</span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                  required
                />
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

              <label>
                <span>Телефон</span>
                <input
                  value={form.phoneNumber}
                  onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
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
                  <option value="Either">Подойдет любой формат</option>
                  <option value="Tent">Палатка</option>
                  <option value="Cabin">Домик</option>
                </select>
              </label>

              <label>
                <span>Контакт доверенного лица</span>
                <input
                  value={form.emergencyContactName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emergencyContactName: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                <span>Телефон доверенного лица</span>
                <input
                  value={form.emergencyContactPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))
                  }
                  required
                />
              </label>
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
              <span>
                Соглашаюсь на обработку персональных данных и передачу анкеты команде лагеря.
              </span>
            </label>

            {message ? <p className="form-success">{message}</p> : null}
            {error ? <p className="form-error">{error}</p> : null}

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
        )}
      </div>
    </div>
  );
}

void CampRegistrationPageLegacy;

function CampRegistrationPage() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedEventSlug = new URLSearchParams(location.search).get('event');
  const [events, setEvents] = useState<PublicEventSummary[]>([]);
  const [selectedEventSlug, setSelectedEventSlug] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<PublicEventDetails | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  const [isLoadingRegistration, setIsLoadingRegistration] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<CampRegistration | null>(null);
  const [form, setForm] = useState<SaveRegistrationRequest>({
    selectedPriceOptionId: null,
    fullName: '',
    birthDate: '',
    city: '',
    churchName: '',
    phoneNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    accommodationPreference: 'Either',
    healthNotes: '',
    allergyNotes: '',
    specialNeeds: '',
    motivation: '',
    consentAccepted: false,
    submit: false,
  });

  useEffect(() => {
    void loadEvents();
  }, [auth.account?.user.id, requestedEventSlug]);

  useEffect(() => {
    if (!selectedEventSlug) {
      setSelectedEvent(null);
      setRegistration(null);
      return;
    }

    void loadSelectedEvent(selectedEventSlug);
  }, [selectedEventSlug, auth.account?.user.id]);

  async function loadEvents() {
    setIsLoadingEvents(true);
    setError(null);

    try {
      const response = await getPublicEvents();
      setEvents(response.events);

      const preferredSlug = pickPreferredEventSlug(
        response.events,
        auth.account?.registrations ?? [],
        requestedEventSlug,
      );

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

    try {
      const [eventDetails, currentRegistration] = await Promise.all([
        getPublicEvent(eventSlug),
        auth.loadRegistration(eventSlug),
      ]);

      setSelectedEvent(eventDetails);
      setRegistration(currentRegistration);

      if (currentRegistration) {
        setForm({
          selectedPriceOptionId: currentRegistration.selectedPriceOptionId ?? null,
          fullName: currentRegistration.fullName,
          birthDate: currentRegistration.birthDate,
          city: currentRegistration.city,
          churchName: currentRegistration.churchName,
          phoneNumber: currentRegistration.phoneNumber,
          emergencyContactName: currentRegistration.emergencyContactName,
          emergencyContactPhone: currentRegistration.emergencyContactPhone,
          accommodationPreference: currentRegistration.accommodationPreference,
          healthNotes: currentRegistration.healthNotes ?? '',
          allergyNotes: currentRegistration.allergyNotes ?? '',
          specialNeeds: currentRegistration.specialNeeds ?? '',
          motivation: currentRegistration.motivation ?? '',
          consentAccepted: currentRegistration.consentAccepted,
          submit: false,
        });

        return;
      }

      const defaultPriceOption = eventDetails.priceOptions.find((option) => option.isDefault && isPriceOptionCurrentlyAvailable(option))
        ?? eventDetails.priceOptions.find((option) => isPriceOptionCurrentlyAvailable(option))
        ?? eventDetails.priceOptions.find((option) => option.isActive)
        ?? null;

      setForm((current) => ({
        ...current,
        selectedPriceOptionId: defaultPriceOption?.id ?? null,
        fullName: auth.account ? `${auth.account.user.firstName} ${auth.account.user.lastName}`.trim() : current.fullName,
        city: auth.account?.user.city ?? '',
        churchName: auth.account?.user.churchName ?? '',
        phoneNumber: auth.account?.user.phoneNumber ?? '',
      }));
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить выбранное мероприятие.';
      setError(nextError);
      toast.error('Не удалось открыть мероприятие', nextError);
      setSelectedEvent(null);
      setRegistration(null);
    } finally {
      setIsLoadingRegistration(false);
    }
  }

  async function submit(submitMode: boolean) {
    if (!selectedEventSlug) {
      const nextError = 'Сначала выберите мероприятие.';
      setError(nextError);
      toast.error('Мероприятие не выбрано', nextError);
      return;
    }

    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      const saved = await auth.saveRegistration(
        {
          ...form,
          submit: submitMode,
        },
        selectedEventSlug,
      );

      setRegistration(saved);
      const successMessage = submitMode ? 'Анкета отправлена команде.' : 'Черновик сохранен.';
      setMessage(successMessage);
      toast.success(submitMode ? 'Анкета отправлена' : 'Черновик сохранен', successMessage);
      await auth.reloadAccount();
    } catch (submitError) {
      const nextError =
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : 'Не удалось сохранить анкету.';
      setError(nextError);
      toast.error('Не удалось сохранить анкету', nextError);
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
              : 'Сначала выберите нужное событие, затем заполните и сохраните анкету.'}
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

      <div className="glass-card stack-form">
        {isLoadingEvents || isLoadingRegistration ? (
          <p className="form-muted">Загружаем выбранное мероприятие и вашу текущую анкету...</p>
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
                <strong>
                  {selectedEvent.remainingCapacity ?? selectedEvent.capacity ?? 'Без лимита'}
                </strong>
              </div>
              <div>
                <span>Статус окна</span>
                <strong>
                  {selectedEvent.isRegistrationOpen
                    ? selectedEvent.isRegistrationClosingSoon
                      ? 'Скоро закрывается'
                      : 'Регистрация открыта'
                    : 'Регистрация закрыта'}
                </strong>
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

            <div className="form-grid">
              <label>
                <span>Имя и фамилия</span>
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  required
                />
              </label>

              <label>
                <span>Дата рождения</span>
                <input
                  type="date"
                  value={form.birthDate}
                  onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                  required
                />
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

              <label>
                <span>Телефон</span>
                <input
                  value={form.phoneNumber}
                  onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))}
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
                  <option value="Either">Подойдет любой формат</option>
                  <option value="Tent">Палатка</option>
                  <option value="Cabin">Домик</option>
                </select>
              </label>

              <label>
                <span>Контакт доверенного лица</span>
                <input
                  value={form.emergencyContactName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emergencyContactName: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                <span>Телефон доверенного лица</span>
                <input
                  value={form.emergencyContactPhone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, emergencyContactPhone: event.target.value }))
                  }
                  required
                />
              </label>
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
            {error ? <p className="form-error">{error}</p> : null}

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
      </div>
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
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [isRegistrationsLoading, setIsRegistrationsLoading] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
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
      const nextError = loadError instanceof Error ? loadError.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё РІРЅРµС€РЅРµР№ Р°РІС‚РѕСЂРёР·Р°С†РёРё.';
      setError(nextError);
      toast.error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ auth-РЅР°СЃС‚СЂРѕР№РєРё', nextError);
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
      const nextError = loadError instanceof Error ? loadError.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїРёСЃРѕРє РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№.';
      setError(nextError);
      toast.error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№', nextError);
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
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ СЃРїРёСЃРѕРє Р°РЅРєРµС‚.';
      setError(nextError);
      toast.error('РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ Р°РЅРєРµС‚С‹', nextError);
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
    : adminSection === 'auth'
    ? {
        eyebrow: 'Внешняя авторизация',
        title: 'Провайдеры входа и журнал проверок',
        description: 'Здесь удобно настраивать Google, VK, Yandex и Telegram, а затем сразу проверять каждый способ входа.',
      }
    : adminSection === 'roles'
      ? {
          eyebrow: 'Роли команды',
          title: 'Роли, зоны ответственности и состав',
          description: 'Здесь видно, какие роли есть в системе, сколько людей сейчас в каждой из них и как распределена команда.',
        }
      : adminSection === 'registrations'
        ? {
            eyebrow: 'Заявки и участие',
            title: 'Заявки в лагерь и их статусы',
            description: 'Этот экран собран для спокойной работы с анкетами: удобно смотреть статусы, искать участников и быстро понимать общую картину.',
          }
        : adminSection === 'users'
          ? {
              eyebrow: 'Доступ и пользователи',
              title: 'Пользователи, права и доступ',
              description: 'Здесь собраны аккаунты, роли, внешние входы и статусы заявок, чтобы права было удобно редактировать без хаоса.',
            }
          : {
              eyebrow: 'Администрирование',
              title: 'Панель управления лагерем',
              description: 'Здесь собран общий обзор по системе: ключевые цифры, роли команды и быстрые переходы в нужные административные разделы.',
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
          <p className="mini-eyebrow">Обзор</p>
          <h3>Сводка и роли</h3>
          <p>Ключевые цифры по системе, роли команды и быстрые переходы к основным административным разделам.</p>
        </NavLink>

        <NavLink to="/admin/events" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">{'\u041c\u0435\u0440\u043e\u043f\u0440\u0438\u044f\u0442\u0438\u044f'}</p>
          <h3>{'\u0421\u043e\u0431\u044b\u0442\u0438\u044f \u0438 \u0432\u044b\u043f\u0443\u0441\u043a\u0438'}</h3>
          <p>
            {'\u041b\u0430\u0433\u0435\u0440\u044f \u043f\u043e \u0433\u043e\u0434\u0430\u043c, \u0440\u0435\u0442\u0440\u0438\u0442\u044b, \u043f\u043e\u0435\u0437\u0434\u043a\u0438 \u0438 \u0438\u0445 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438: \u0434\u0430\u0442\u044b, \u043b\u0438\u043c\u0438\u0442\u044b, \u0442\u0430\u0440\u0438\u0444\u044b, \u043a\u043e\u043d\u0442\u0435\u043d\u0442 \u0438 \u043e\u043a\u043d\u043e \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438.'}
          </p>
        </NavLink>

        <NavLink to="/admin/users" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Пользователи</p>
          <h3>Пользователи и права</h3>
          <p>Все аккаунты в одном месте: роли, статус заявки, последнее посещение и управление доступом.</p>
        </NavLink>

        <NavLink to="/admin/registrations" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Заявки</p>
          <h3>Анкеты и участие</h3>
          <p>Статусы анкет, поиск по участникам и быстрый обзор того, что уже отправлено и подтверждено.</p>
        </NavLink>

        <NavLink to="/admin/roles" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Роли</p>
          <h3>Команда и ответственность</h3>
          <p>Состав ролей, распределение людей по ним и более спокойный обзор зоны ответственности команды.</p>
        </NavLink>

        <NavLink to="/admin/auth" className={({ isActive }) => `glass-card admin-nav-card${isActive ? ' active' : ''}`}>
          <p className="mini-eyebrow">Auth</p>
          <h3>Провайдеры входа</h3>
          <p>Google, VK, Yandex и Telegram с подсказками по полям, диагностикой и встроенной проверкой.</p>
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

              {filteredRegistrations.map((user) => (
                <article className="user-card" key={`registration-${user.id}`}>
                  <div className="user-card-head">
                    <div>
                      <strong className="user-name">{user.displayName}</strong>
                      <p className="user-meta">
                        {user.email}
                        {user.registrationEventTitle ? ` • ${user.registrationEventTitle}` : ''}
                      </p>
                    </div>

                    <div className="role-pills">
                      <span className="role-pill">{formatStatus(user.registrationStatus)}</span>
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
                </article>
              ))}

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
        <Route path="/camp-registration" element={<CampRegistrationPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/access" element={<AdminPage />} />
        <Route path="/admin/events" element={<AdminPage />} />
        <Route path="/admin/users" element={<AdminPage />} />
        <Route path="/admin/registrations" element={<AdminPage />} />
        <Route path="/admin/roles" element={<AdminPage />} />
        <Route path="/admin/auth" element={<AdminPage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
