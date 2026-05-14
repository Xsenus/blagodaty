import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  deleteAdminRegistration,
  deleteAdminUser,
  getAdminEvents,
  getAdminExternalAuthSettings,
  getAdminGoogleSheetsSyncSettings,
  getAdminOverview,
  getAdminTelegramOverview,
  getAdminRegistrations,
  getAdminUsers,
  getExternalAuthStatus,
  runAdminGoogleSheetsSync,
  getTelegramAuthStatus,
  linkAdminRegistrationToUser,
  mergeAdminUsers,
  startAdminExternalAuthProviderTest,
  updateAdminUser,
  updateAdminExternalAuthProvider,
  updateAdminRegistrationPayment,
  updateAdminRegistrationStatus,
  updateUserRoles,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import { formatPhoneForInput, normalizePhone } from '../ui/PhoneVerificationPanel';
import type {
  AdminEventSummary,
  AdminExternalAuthProvider,
  AdminExternalAuthSettings,
  AdminGoogleSheetsSyncSettings,
  AdminRegistrationHistoryEntry,
  AdminOverview,
  AdminTelegramOverview,
  AdminUser,
  AppRole,
  EventEditionStatus,
  PaginatedResponse,
  RegistrationStatus,
  UpdateAdminUserRequest,
  UpdateExternalAuthProviderRequest,
} from '../types';
import { AdminBackupsSection } from './AdminBackupsSection';
import { AdminEventsSection } from './AdminEventsSection';
import { AdminGallerySection } from './AdminGallerySection';
import { AdminSiteSettingsSection } from './AdminSiteSettingsSection';
import { AdminTelegramSection } from './AdminTelegramSection';
import {
  AdminSectionHeader,
  AdminShell,
  ConfirmDialog,
  DataToolbar,
  Drawer,
  EmptyState,
  ErrorState,
  FormSection,
  LoadingState,
  Pagination,
  SelectBox,
  StatCard,
  StatusBadge,
} from './components/AdminUi';

type AdminSection =
  | 'overview'
  | 'registrations'
  | 'users'
  | 'roles'
  | 'events'
  | 'gallery'
  | 'site'
  | 'telegram'
  | 'backups'
  | 'auth';

const roleLabels: Record<AppRole, string> = {
  Member: 'Участник',
  CampManager: 'Координатор',
  Admin: 'Администратор',
};

const statusLabels: Record<RegistrationStatus, string> = {
  Draft: 'Черновик',
  Submitted: 'Отправлено',
  Confirmed: 'Подтверждено',
  Cancelled: 'Отменено',
};

function isAdmin(roles: string[] | undefined) {
  return Boolean(roles?.includes('Admin'));
}

function orderRoles(roles: AppRole[]) {
  const order: Record<AppRole, number> = { Member: 0, CampManager: 1, Admin: 2 };
  return [...roles].sort((left, right) => order[left] - order[right]);
}

function rolesEqual(left: AppRole[], right: AppRole[]) {
  const leftOrdered = orderRoles(left);
  const rightOrdered = orderRoles(right);
  return leftOrdered.length === rightOrdered.length && leftOrdered.every((role, index) => role === rightOrdered[index]);
}

function formatRole(role: string) {
  return roleLabels[role as AppRole] ?? role;
}

function formatStatus(status?: RegistrationStatus | null) {
  return status ? statusLabels[status] ?? status : 'Без заявки';
}

function statusTone(status?: RegistrationStatus | null) {
  switch (status) {
    case 'Confirmed':
      return 'success';
    case 'Submitted':
      return 'warning';
    case 'Cancelled':
      return 'muted';
    case 'Draft':
      return 'info';
    default:
      return 'neutral';
  }
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Не указано';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateAndTime(value?: string | null) {
  if (!value) {
    return { date: 'Не указано', time: '' };
  }

  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date),
  };
}

function formatHistoryValue(entry: AdminRegistrationHistoryEntry, value?: string | null) {
  if (!value) {
    return 'Пусто';
  }

  return entry.changeType === 'Status' ? formatStatus(value as RegistrationStatus) : value;
}

function formatMoney(value?: number | null, currency = 'RUB') {
  if (value == null) {
    return 'Не указано';
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Не указано';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getEventStatusLabel(status: EventEditionStatus) {
  switch (status) {
    case 'RegistrationOpen':
      return 'Регистрация открыта';
    case 'Published':
      return 'Опубликовано';
    case 'Draft':
      return 'Черновик';
    case 'RegistrationClosed':
      return 'Регистрация закрыта';
    case 'InProgress':
      return 'Идет сейчас';
    case 'Completed':
      return 'Завершено';
    case 'Archived':
      return 'Архив';
    default:
      return status;
  }
}

function createExternalAuthProviderDraft(provider: AdminExternalAuthProvider): UpdateExternalAuthProviderRequest {
  return {
    enabled: provider.enabled,
    clientId: provider.clientId ?? '',
    clientSecret: '',
    widgetEnabled: provider.widgetEnabled,
    botUsername: provider.botUsername ?? '',
    botToken: '',
    webhookSecret: '',
  };
}

function getSection(pathname: string): AdminSection {
  if (pathname.startsWith('/admin/registrations')) return 'registrations';
  if (pathname.startsWith('/admin/users') || pathname.startsWith('/admin/access')) return 'users';
  if (pathname.startsWith('/admin/roles')) return 'roles';
  if (pathname.startsWith('/admin/events')) return 'events';
  if (pathname.startsWith('/admin/gallery')) return 'gallery';
  if (pathname.startsWith('/admin/site')) return 'site';
  if (pathname.startsWith('/admin/telegram')) return 'telegram';
  if (pathname.startsWith('/admin/backups')) return 'backups';
  if (pathname.startsWith('/admin/auth')) return 'auth';
  return 'overview';
}

function getSectionMeta(section: AdminSection) {
  switch (section) {
    case 'registrations':
      return {
        eyebrow: 'Участники',
        title: 'Заявки на мероприятия',
        description: 'Очередь заявок, статусы, контакты, участники и быстрые админ-действия.',
      };
    case 'users':
      return {
        eyebrow: 'Доступ',
        title: 'Пользователи и роли',
        description: 'Аккаунты, внешние входы, город, церковь и права доступа.',
      };
    case 'roles':
      return {
        eyebrow: 'Команда',
        title: 'Роли и зоны ответственности',
        description: 'Справочник ролей, состав и быстрый переход к пользователям нужной роли.',
      };
    case 'events':
      return {
        eyebrow: 'Контент',
        title: 'Мероприятия и регистрация',
        description: 'Сезоны, даты, тарифы, расписание, медиа и контент карточек.',
      };
    case 'gallery':
      return {
        eyebrow: 'Контент',
        title: 'Медиатека',
        description: 'Файлы на сервере, URL, подписи и публикация в интерфейсах.',
      };
    case 'site':
      return {
        eyebrow: 'Публичный сайт',
        title: 'Ссылки, контакты и Google Sheets',
        description: 'Публичные ссылки, соцсети, контактные лица и синхронизация таблиц.',
      };
    case 'telegram':
      return {
        eyebrow: 'Интеграции',
        title: 'Telegram-бот и рабочие чаты',
        description: 'Чаты, подписки, команды и доставка уведомлений команде.',
      };
    case 'backups':
      return {
        eyebrow: 'Система',
        title: 'Бэкапы базы',
        description: 'Ручные и автоматические резервные копии, скачивание и отправка администраторам.',
      };
    case 'auth':
      return {
        eyebrow: 'Интеграции',
        title: 'Провайдеры входа',
        description: 'Google, VK, Yandex и Telegram: состояние, диагностика, секреты и проверки.',
      };
    default:
      return {
        eyebrow: 'Дашборд',
        title: 'Состояние системы',
        description: 'Пользователи, заявки, интеграции и заполненность мероприятий.',
      };
  }
}

export function AdminWorkspace() {
  const auth = useAuth();
  const location = useLocation();
  const section = getSection(location.pathname);
  const meta = getSectionMeta(section);
  const canOpenAdmin = isAdmin(auth.account?.user.roles);
  const accessToken = auth.session?.accessToken ?? null;

  if (!canOpenAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  return (
    <AdminShell
      accessLabel={auth.account?.user.displayName ?? 'Администратор'}
      description={meta.description}
      eyebrow={meta.eyebrow}
      hideHeader={[
        'overview',
        'registrations',
        'users',
        'gallery',
        'site',
        'telegram',
        'backups',
        'auth',
      ].includes(section)}
      title={meta.title}
    >
      <AdminContent accessToken={accessToken} section={section} />
    </AdminShell>
  );
}

function AdminContent({ accessToken, section }: { accessToken: string | null; section: AdminSection }) {
  switch (section) {
    case 'registrations':
      return <RegistrationsSection accessToken={accessToken} />;
    case 'users':
      return <UsersSection accessToken={accessToken} />;
    case 'roles':
      return <RolesSection accessToken={accessToken} />;
    case 'events':
      return <AdminEventsSection accessToken={accessToken} isActive />;
    case 'gallery':
      return <AdminGallerySection accessToken={accessToken} isActive />;
    case 'site':
      return <AdminSiteSettingsSection accessToken={accessToken} isActive />;
    case 'telegram':
      return <AdminTelegramSection accessToken={accessToken} isActive />;
    case 'backups':
      return <AdminBackupsSection accessToken={accessToken} isActive />;
    case 'auth':
      return <AuthProvidersSection accessToken={accessToken} />;
    default:
      return <OverviewSection accessToken={accessToken} />;
  }
}

function OverviewSection({ accessToken }: { accessToken: string | null }) {
  const toast = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [authSettings, setAuthSettings] = useState<AdminExternalAuthSettings | null>(null);
  const [googleSync, setGoogleSync] = useState<AdminGoogleSheetsSyncSettings | null>(null);
  const [telegramOverview, setTelegramOverview] = useState<AdminTelegramOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [overviewResponse, eventsResponse, authResponse, sheetsResponse, telegramResponse] = await Promise.all([
          getAdminOverview(accessToken),
          getAdminEvents(accessToken),
          getAdminExternalAuthSettings(accessToken),
          getAdminGoogleSheetsSyncSettings(accessToken),
          getAdminTelegramOverview(accessToken),
        ]);
        if (cancelled) return;
        setOverview(overviewResponse);
        setEvents(eventsResponse.events);
        setAuthSettings(authResponse);
        setGoogleSync(sheetsResponse);
        setTelegramOverview(telegramResponse);
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Не удалось загрузить сводку.';
        setError(message);
        toast.error('Сводка недоступна', message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, toast]);

  if (isLoading) return <LoadingState title="Загружаем рабочую сводку" />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return <EmptyState title="Нет данных для сводки" />;

  const openEvents = events.filter((event) => event.status === 'RegistrationOpen');
  const nearestClosing = [...events]
    .filter((event) => event.registrationClosesAtUtc)
    .sort((left, right) => new Date(left.registrationClosesAtUtc!).getTime() - new Date(right.registrationClosesAtUtc!).getTime())[0];
  const readyProviders = authSettings?.providers.filter((provider) => provider.enabled && provider.ready) ?? [];
  const brokenProviders = authSettings?.providers.filter((provider) => provider.enabled && !provider.ready) ?? [];
  const totalProviders = authSettings?.providers.length ?? 0;
  const eventReports = [...events].sort((left, right) => {
    const leftPriority = left.status === 'RegistrationOpen' ? 0 : 1;
    const rightPriority = right.status === 'RegistrationOpen' ? 0 : 1;
    return leftPriority - rightPriority || new Date(left.startsAtUtc).getTime() - new Date(right.startsAtUtc).getTime();
  });

  async function syncSheetsNow() {
    if (!accessToken || !googleSync?.enabled) {
      return;
    }

    setIsSyncingSheets(true);
    try {
      const result = await runAdminGoogleSheetsSync(accessToken);
      setGoogleSync((current) =>
        current
          ? {
              ...current,
              lastSyncedAtUtc: result.syncedAtUtc ?? new Date().toISOString(),
              lastError: result.synced ? null : result.message,
            }
          : current,
      );
      toast.success('Google Sheets обновлены', result.message);
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Не удалось запустить синхронизацию.';
      setGoogleSync((current) => (current ? { ...current, lastError: message } : current));
      toast.error('Синхронизация не выполнена', message);
    } finally {
      setIsSyncingSheets(false);
    }
  }

  return (
    <div className="admin-workspace-stack admin-dashboard">
      <section className="admin-kpi-grid admin-dashboard-kpis">
        <StatCard label="Пользователи" value={overview.stats.totalUsers} hint="Всего аккаунтов" />
        <StatCard label="Всего заявок" value={overview.stats.totalRegistrations} hint="По всем мероприятиям" />
        <StatCard label="Ждут внимания" value={overview.stats.submittedRegistrations} hint="Статус Отправлено" tone="warning" />
        <StatCard label="Подтверждены" value={overview.stats.confirmedRegistrations} hint="Занимают места" tone="success" />
        <StatCard label="Открытых регистраций" value={openEvents.length} hint="Сейчас принимают заявки" />
        <StatCard label="Ближайшее закрытие" value={nearestClosing ? formatDateTime(nearestClosing.registrationClosesAtUtc) : 'Нет'} hint={nearestClosing?.title ?? 'Окон регистрации нет'} />
      </section>

      <section className="admin-dashboard-grid">
        <article className="admin-panel admin-dashboard-panel">
          <AdminSectionHeader eyebrow="Интеграции" title="Синхронизация и каналы" />
          <div className="admin-integration-grid">
            <div className="admin-integration-card">
              <div>
                <strong>Google Sheets</strong>
                <StatusBadge
                  label={!googleSync?.enabled ? 'Выключено' : googleSync.lastError ? 'Ошибка' : googleSync.lastSyncedAtUtc ? 'Синхронизировано' : 'Ожидает запуска'}
                  tone={!googleSync?.enabled ? 'muted' : googleSync.lastError ? 'danger' : 'success'}
                />
              </div>
              <p>{googleSync?.lastError || (googleSync?.lastSyncedAtUtc ? `Последняя синхронизация: ${formatDateTime(googleSync.lastSyncedAtUtc)}` : 'Быстрая выгрузка заявок в документ Google.')}</p>
              <button
                className="secondary-button"
                type="button"
                disabled={!googleSync?.enabled || isSyncingSheets}
                onClick={() => void syncSheetsNow()}
              >
                {isSyncingSheets ? 'Синхронизируем...' : 'Синхронизировать'}
              </button>
            </div>

            <div className="admin-integration-card">
              <div>
                <strong>Telegram</strong>
                <StatusBadge
                  label={(telegramOverview?.summary.activeChats ?? 0) > 0 ? 'Работает' : 'Нет активных чатов'}
                  tone={(telegramOverview?.summary.activeChats ?? 0) > 0 ? 'success' : 'warning'}
                />
              </div>
              <p>
                Активных чатов: {telegramOverview?.summary.activeChats ?? 0}, подписок: {telegramOverview?.summary.totalSubscriptions ?? 0}.
              </p>
            </div>

            <div className="admin-integration-card">
              <div>
                <strong>Авторизация</strong>
                <StatusBadge
                  label={brokenProviders.length ? 'Есть ошибки' : `${readyProviders.length}/${totalProviders} готовы`}
                  tone={brokenProviders.length ? 'warning' : 'success'}
                />
              </div>
              <p>Google, VK, Yandex и Telegram: состояние входа и диагностика провайдеров.</p>
              <div className="admin-provider-status-list">
                {(authSettings?.providers ?? []).map((provider) => (
                  <span key={provider.provider} className={provider.enabled && provider.ready ? 'is-ok' : provider.enabled ? 'is-warning' : ''}>
                    {provider.displayName}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="admin-panel admin-dashboard-panel">
          <AdminSectionHeader eyebrow="Фокус" title="Требует внимания" />
          <div className="admin-health-list">
            <div>
              <strong>{overview.stats.submittedRegistrations}</strong>
              <span>заявок ожидают решения</span>
            </div>
            <div>
              <strong>{brokenProviders.length}</strong>
              <span>auth-провайдеров включены, но не готовы</span>
            </div>
            <div>
              <strong>{googleSync?.lastError ? 1 : 0}</strong>
              <span>ошибок Google Sheets</span>
            </div>
            <div>
              <strong>{telegramOverview?.summary.recentCommandsCount ?? 0}</strong>
              <span>последних Telegram-команд</span>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-panel admin-dashboard-panel">
        <AdminSectionHeader eyebrow="Мероприятия" title="Отчеты по заполненности и заявкам" />
        <div className="admin-event-report-list">
          {eventReports.map((event) => {
            const occupancyPercent = event.capacity ? Math.min(100, Math.round((event.confirmedRegistrations / event.capacity) * 100)) : null;
            const otherRegistrations = Math.max(event.registrationsCount - event.submittedRegistrations - event.confirmedRegistrations, 0);

            return (
              <article className="admin-event-report" key={event.id}>
                <div className="admin-event-report-head">
                  <div>
                    <strong>{event.title}</strong>
                    <span>{formatDate(event.startsAtUtc)} - {formatDate(event.endsAtUtc)}</span>
                  </div>
                  <StatusBadge label={getEventStatusLabel(event.status)} tone={event.status === 'RegistrationOpen' ? 'success' : 'neutral'} />
                </div>

                <div className="admin-event-report-metrics">
                  <div><span>Всего</span><strong>{event.registrationsCount}</strong></div>
                  <div><span>Ждут</span><strong>{event.submittedRegistrations}</strong></div>
                  <div><span>Подтверждены</span><strong>{event.confirmedRegistrations}</strong></div>
                  <div><span>Прочие</span><strong>{otherRegistrations}</strong></div>
                  <div><span>Осталось</span><strong>{event.remainingCapacity ?? 'Без лимита'}</strong></div>
                </div>

                <div className="admin-event-capacity">
                  <div>
                    <span>Заполняемость</span>
                    <strong>{occupancyPercent == null ? 'Без лимита' : `${occupancyPercent}%`}</strong>
                  </div>
                  <div className="admin-event-capacity-track" aria-hidden="true">
                    <span style={{ width: `${occupancyPercent ?? 0}%` }} />
                  </div>
                </div>
              </article>
            );
          })}
          {!eventReports.length ? <EmptyState title="Мероприятий пока нет" description="После создания события здесь появится отчет по заявкам и местам." /> : null}
        </div>
      </section>
    </div>
  );
}

function RegistrationsSection({ accessToken }: { accessToken: string | null }) {
  const toast = useToast();
  const location = useLocation();
  const queryStatus = new URLSearchParams(location.search).get('status') as RegistrationStatus | null;
  const [registrationsPage, setRegistrationsPage] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | RegistrationStatus>(
    queryStatus && queryStatus in statusLabels ? queryStatus : 'all',
  );
  const [eventId, setEventId] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<AdminUser | null>(null);
  const [statusDraft, setStatusDraft] = useState<RegistrationStatus>('Submitted');
  const [savingRegistrationId, setSavingRegistrationId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; registration: AdminUser } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void loadEvents();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadRegistrations();
  }, [accessToken, search, status, eventId, page, pageSize]);

  useEffect(() => {
    if (selectedRegistration?.registrationStatus) {
      setStatusDraft(selectedRegistration.registrationStatus);
    }
  }, [selectedRegistration]);

  useEffect(() => {
    if (!contextMenu) return undefined;

    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  async function loadEvents() {
    if (!accessToken) return;
    try {
      const response = await getAdminEvents(accessToken);
      setEvents(response.events);
    } catch {
      setEvents([]);
    }
  }

  async function loadRegistrations() {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await getAdminRegistrations(accessToken, {
        page,
        pageSize,
        search,
        status,
        eventEditionId: eventId,
      });
      setRegistrationsPage(response);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Не удалось загрузить заявки.';
      setError(message);
      toast.error('Заявки не загрузились', message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveStatus() {
    if (!accessToken || !selectedRegistration?.registrationId) return;

    if (selectedRegistration.registrationStatus === 'Confirmed' && statusDraft === 'Cancelled') {
      const confirmed = window.confirm('Отменить подтвержденную заявку? Место освободится.');
      if (!confirmed) return;
    }

    setSavingRegistrationId(selectedRegistration.registrationId);
    try {
      const updated = await updateAdminRegistrationStatus(accessToken, selectedRegistration.registrationId, statusDraft);
      setSelectedRegistration(updated);
      await loadRegistrations();
      toast.success('Статус обновлен', `${updated.displayName}: ${formatStatus(updated.registrationStatus)}.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось обновить статус.';
      toast.error('Статус не сохранен', message);
    } finally {
      setSavingRegistrationId(null);
    }
  }

  async function changeRegistrationStatus(registration: AdminUser, nextStatus: RegistrationStatus) {
    if (!accessToken || !registration.registrationId) return;

    if (registration.registrationStatus === nextStatus) {
      setContextMenu(null);
      return;
    }

    setSavingRegistrationId(registration.registrationId);
    setContextMenu(null);
    try {
      const updated = await updateAdminRegistrationStatus(accessToken, registration.registrationId, nextStatus);
      if (selectedRegistration?.registrationId === updated.registrationId) {
        setSelectedRegistration(updated);
      }
      await loadRegistrations();
      toast.success('Статус обновлен', `${updated.registrationFullName || updated.displayName}: ${formatStatus(updated.registrationStatus)}.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось обновить статус.';
      toast.error('Статус не сохранен', message);
    } finally {
      setSavingRegistrationId(null);
    }
  }

  async function changeRegistrationPayment(registration: AdminUser, isPaid: boolean) {
    if (!accessToken || !registration.registrationId) return;

    setSavingRegistrationId(registration.registrationId);
    setContextMenu(null);
    try {
      const updated = await updateAdminRegistrationPayment(accessToken, registration.registrationId, isPaid);
      if (selectedRegistration?.registrationId === updated.registrationId) {
        setSelectedRegistration(updated);
      }
      await loadRegistrations();
      toast.success(isPaid ? 'Оплата отмечена' : 'Оплата отменена', updated.registrationFullName || updated.displayName);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось обновить оплату.';
      toast.error('Оплата не сохранена', message);
    } finally {
      setSavingRegistrationId(null);
    }
  }

  async function confirmDelete() {
    if (!accessToken || !deleteTarget?.registrationId) return;
    setSavingRegistrationId(deleteTarget.registrationId);
    try {
      await deleteAdminRegistration(accessToken, deleteTarget.registrationId);
      setDeleteTarget(null);
      if (selectedRegistration?.id === deleteTarget.id) setSelectedRegistration(null);
      await loadRegistrations();
      toast.success('Заявка удалена', 'Список и лимиты обновлены.');
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Не удалось удалить заявку.';
      toast.error('Заявка не удалена', message);
    } finally {
      setSavingRegistrationId(null);
    }
  }

  const registrations = registrationsPage?.items ?? [];
  const statusOptions: Array<{ value: 'all' | RegistrationStatus; label: string }> = [
    { value: 'all', label: 'Все статусы' },
    { value: 'Submitted', label: 'Отправлено' },
    { value: 'Confirmed', label: 'Подтверждено' },
    { value: 'Cancelled', label: 'Отменено' },
    { value: 'Draft', label: 'Черновики' },
  ];
  const eventOptions = [
    { value: 'all', label: 'Все мероприятия' },
    ...events.map((event) => ({ value: event.id, label: event.title })),
  ];

  return (
    <div className="admin-workspace-stack">
      <DataToolbar>
        <label>
          <span>Поиск</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Имя, email, телефон, город" />
        </label>
        <label>
          <span>Статус</span>
          <SelectBox
            value={status}
            options={statusOptions}
            ariaLabel="Фильтр по статусу"
            onChange={(nextStatus) => {
              setStatus(nextStatus);
              setPage(1);
            }}
          />
        </label>
        <label>
          <span>Мероприятие</span>
          <SelectBox
            value={eventId}
            options={eventOptions}
            ariaLabel="Фильтр по мероприятию"
            onChange={(nextEventId) => {
              setEventId(nextEventId);
              setPage(1);
            }}
          />
        </label>
        <button
          aria-label="Сбросить фильтры"
          className="admin-reset-icon-button"
          title="Сбросить фильтры"
          type="button"
          onClick={() => { setSearch(''); setStatus('all'); setEventId('all'); setPage(1); }}
        >
          ↺
        </button>
      </DataToolbar>

      {error ? <ErrorState message={error} /> : null}
      {isLoading && !registrationsPage ? <LoadingState title="Загружаем заявки" /> : null}
      {!isLoading && registrationsPage && registrations.length === 0 ? <EmptyState title="Заявки не найдены" description="Измените фильтры или сбросьте поиск." /> : null}

      {registrations.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Контакты</th>
                <th>Мероприятие</th>
                <th className="admin-table-center">Статус</th>
                <th className="admin-table-center">Тариф</th>
                <th className="admin-table-center">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => {
                const updated = formatDateAndTime(registration.registrationUpdatedAtUtc);
                return (
                <tr
                  key={registration.id}
                  onDoubleClick={() => setSelectedRegistration(registration)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, registration });
                  }}
                >
                  <td>
                    <strong>{registration.registrationFullName || registration.displayName}</strong>
                    <span>{registration.registrationParticipantsCount ?? 1} чел.</span>
                  </td>
                  <td>
                    <strong>{registration.registrationPhoneNumber || registration.phoneNumber || 'Телефон не указан'}</strong>
                    <span>{registration.registrationContactEmail || registration.email}</span>
                  </td>
                  <td>
                    <strong>{registration.registrationEventTitle || 'Не указано'}</strong>
                    <span>{registration.city || registration.churchName || 'Без города'}</span>
                  </td>
                  <td className="admin-table-center"><StatusBadge label={formatStatus(registration.registrationStatus)} tone={statusTone(registration.registrationStatus)} /></td>
                  <td className="admin-table-tariff-cell">
                    <strong>{registration.registrationSelectedPriceOptionTitle || 'Не выбран'}</strong>
                    <span>{formatMoney(registration.registrationSelectedPriceOptionAmount, registration.registrationSelectedPriceOptionCurrency ?? 'RUB')}</span>
                    <StatusBadge label={registration.registrationIsPaid ? 'Оплачено' : 'Не оплачено'} tone={registration.registrationIsPaid ? 'success' : 'muted'} />
                  </td>
                  <td className="admin-date-cell">
                    <strong>{updated.date}</strong>
                    <span>{updated.time}</span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <div className="admin-mobile-list">
            {registrations.map((registration) => (
              <article className="admin-mobile-card" key={registration.id}>
                <div>
                  <strong>{registration.registrationFullName || registration.displayName}</strong>
                  <StatusBadge label={formatStatus(registration.registrationStatus)} tone={statusTone(registration.registrationStatus)} />
                </div>
                <p>{registration.registrationEventTitle}</p>
                <p>{registration.registrationPhoneNumber || registration.email}</p>
                <button className="secondary-button" type="button" onClick={() => setSelectedRegistration(registration)}>Открыть</button>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {registrationsPage ? (
        <Pagination
          page={registrationsPage.page}
          pageSize={registrationsPage.pageSize}
          totalItems={registrationsPage.totalItems}
          totalPages={registrationsPage.totalPages}
          isLoading={isLoading}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      ) : null}

      {contextMenu ? (
        <div
          className="admin-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div>
            <button type="button" onClick={() => { setSelectedRegistration(contextMenu.registration); setContextMenu(null); }}>Открыть</button>
          </div>
          <div>
            <button type="button" onClick={() => void changeRegistrationStatus(contextMenu.registration, 'Confirmed')}>Подтвердить</button>
            <button type="button" onClick={() => void changeRegistrationStatus(contextMenu.registration, 'Cancelled')}>Отменить</button>
          </div>
          <div>
            <button type="button" onClick={() => void changeRegistrationPayment(contextMenu.registration, !contextMenu.registration.registrationIsPaid)}>
              {contextMenu.registration.registrationIsPaid ? 'Отменить оплату' : 'Оплачено'}
            </button>
          </div>
          <div>
            <button className="danger" type="button" onClick={() => { setDeleteTarget(contextMenu.registration); setContextMenu(null); }}>Удалить</button>
          </div>
        </div>
      ) : null}

      <Drawer
        open={Boolean(selectedRegistration)}
        title={selectedRegistration?.registrationFullName || selectedRegistration?.displayName || 'Заявка'}
        description={selectedRegistration?.registrationEventTitle ?? 'Детали заявки'}
        onClose={() => setSelectedRegistration(null)}
        footer={
          selectedRegistration?.registrationId ? (
            <>
              <button className="secondary-button" type="button" disabled={savingRegistrationId === selectedRegistration.registrationId} onClick={saveStatus}>
                {savingRegistrationId === selectedRegistration.registrationId ? 'Сохраняем...' : 'Сохранить статус'}
              </button>
              <button className="danger-link" type="button" onClick={() => setDeleteTarget(selectedRegistration)}>
                Удалить заявку
              </button>
            </>
          ) : null
        }
      >
        {selectedRegistration ? (
          <RegistrationDetails registration={selectedRegistration} statusDraft={statusDraft} onStatusDraftChange={setStatusDraft} />
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить заявку?"
        description={deleteTarget ? `${deleteTarget.registrationFullName || deleteTarget.displayName}. Действие удалит заявку и участников из события.` : undefined}
        confirmLabel={savingRegistrationId ? 'Удаляем...' : 'Удалить'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function RegistrationDetails({
  registration,
  statusDraft,
  onStatusDraftChange,
}: {
  registration: AdminUser;
  statusDraft: RegistrationStatus;
  onStatusDraftChange: (status: RegistrationStatus) => void;
}) {
  return (
    <div className="admin-detail-stack">
      <FormSection title="Админ-действия" description="Статус сохраняется отдельной кнопкой внизу панели.">
        <label>
          <span>Статус заявки</span>
          <select value={statusDraft} onChange={(event) => onStatusDraftChange(event.target.value as RegistrationStatus)}>
            <option value="Draft">Черновик</option>
            <option value="Submitted">Отправлено</option>
            <option value="Confirmed">Подтверждено</option>
            <option value="Cancelled">Отменено</option>
          </select>
        </label>
      </FormSection>
      <FormSection title="Основное">
        <div className="admin-detail-grid">
          <div><span>Мероприятие</span><strong>{registration.registrationEventTitle || 'Не указано'}</strong></div>
          <div><span>Тариф</span><strong>{registration.registrationSelectedPriceOptionTitle || 'Не выбран'}</strong></div>
          <div><span>Стоимость</span><strong>{formatMoney(registration.registrationSelectedPriceOptionAmount, registration.registrationSelectedPriceOptionCurrency ?? 'RUB')}</strong></div>
          <div><span>Оплата</span><strong>{registration.registrationIsPaid ? `Оплачено${registration.registrationPaidAtUtc ? `, ${formatDateTime(registration.registrationPaidAtUtc)}` : ''}` : 'Не оплачено'}</strong></div>
          <div><span>Участников</span><strong>{registration.registrationParticipantsCount ?? 1}</strong></div>
        </div>
      </FormSection>
      <FormSection title="Контакты">
        <div className="admin-detail-grid">
          <div><span>Email</span><strong>{registration.registrationContactEmail || registration.email}</strong></div>
          <div><span>Телефон</span><strong>{registration.registrationPhoneNumber || registration.phoneNumber || 'Не указан'}</strong></div>
          <div><span>Телефон подтвержден</span><strong>{registration.registrationPhoneNumberConfirmed ? 'Да' : 'Нет'}</strong></div>
          <div><span>Город / церковь</span><strong>{[registration.city, registration.churchName].filter(Boolean).join(' / ') || 'Не указано'}</strong></div>
        </div>
      </FormSection>
      <FormSection title="Участники">
        <div className="admin-participant-list">
          {registration.registrationParticipants.length ? registration.registrationParticipants.map((participant) => (
            <article key={`${participant.fullName}-${participant.sortOrder}`}>
              <strong>{participant.fullName}</strong>
              <span>{participant.birthDate || 'Дата не указана'} · {participant.isChild ? '16-17 лет' : 'Взрослый'}</span>
            </article>
          )) : <p className="form-muted">Участники не заполнены отдельно.</p>}
        </div>
      </FormSection>
      <FormSection title="Размещение, транспорт и здоровье">
        <div className="admin-detail-grid">
          <div><span>Размещение</span><strong>{registration.registrationAccommodationPreference || 'Не указано'}</strong></div>
          <div><span>Машина</span><strong>{registration.registrationHasCar ? 'Да' : 'Нет'}</strong></div>
          <div><span>Дети</span><strong>{registration.registrationHasChildren ? 'Да' : 'Нет'}</strong></div>
          <div><span>Экстренный контакт</span><strong>{registration.registrationEmergencyContactName || 'Не указан'}</strong></div>
        </div>
        <p>{registration.registrationHealthNotes || registration.registrationAllergyNotes || registration.registrationSpecialNeeds || 'Медицинских заметок нет.'}</p>
      </FormSection>
      <FormSection title="История и согласия">
        <div className="admin-detail-grid">
          <div><span>Создано</span><strong>{formatDateTime(registration.registrationCreatedAtUtc)}</strong></div>
          <div><span>Отправлено</span><strong>{formatDateTime(registration.registrationSubmittedAtUtc)}</strong></div>
          <div><span>Обновлено</span><strong>{formatDateTime(registration.registrationUpdatedAtUtc)}</strong></div>
          <div><span>Согласие</span><strong>{registration.registrationConsentAccepted ? 'Принято' : 'Нет'}</strong></div>
          <div><span>Оплату менял</span><strong>{registration.registrationPaymentUpdatedBy || 'Нет данных'}</strong></div>
        </div>
      </FormSection>
      <FormSection title="История изменений">
        <div className="admin-history-list">
          {registration.registrationHistory.length ? registration.registrationHistory.map((entry) => (
            <article key={`${entry.changeType}-${entry.createdAtUtc}-${entry.newValue}`}>
              <div>
                <strong>{entry.changeType === 'Payment' ? 'Оплата' : 'Статус'}</strong>
                <span>{formatDateTime(entry.createdAtUtc)}</span>
              </div>
              <p>{formatHistoryValue(entry, entry.previousValue)} → {formatHistoryValue(entry, entry.newValue)}</p>
              <small>{entry.actorDisplayName}</small>
            </article>
          )) : <p className="form-muted">Изменений пока нет.</p>}
        </div>
      </FormSection>
    </div>
  );
}

function UsersSection({ accessToken }: { accessToken: string | null }) {
  const toast = useToast();
  const location = useLocation();
  const auth = useAuth();
  const queryRole = new URLSearchParams(location.search).get('role') as AppRole | null;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [usersPage, setUsersPage] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>(
    queryRole && queryRole in roleLabels ? queryRole : 'all',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [roleDraft, setRoleDraft] = useState<AppRole[]>([]);
  const [profileDraft, setProfileDraft] = useState<UpdateAdminUserRequest>({
    firstName: '',
    lastName: '',
    patronymic: '',
    displayName: '',
    phoneNumber: '',
    city: '',
    churchName: '',
  });
  const [linkRegistrationId, setLinkRegistrationId] = useState('');
  const [mergeTargetUserId, setMergeTargetUserId] = useState('');
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; user: AdminUser } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void loadOverview();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadUsers();
  }, [accessToken, search, roleFilter, page, pageSize]);

  useEffect(() => {
    setRoleDraft(orderRoles([...(selectedUser?.roles ?? [])]));
    setProfileDraft({
      firstName: selectedUser?.firstName ?? '',
      lastName: selectedUser?.lastName ?? '',
      patronymic: selectedUser?.patronymic ?? '',
      displayName: selectedUser?.displayName ?? '',
      phoneNumber: formatPhoneForInput(selectedUser?.phoneNumber),
      city: selectedUser?.city ?? '',
      churchName: selectedUser?.churchName ?? '',
    });
    setLinkRegistrationId('');
    setMergeTargetUserId('');
  }, [selectedUser]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', close);
    };
  }, [contextMenu]);

  async function loadOverview() {
    if (!accessToken) return;
    const loaded = await getAdminOverview(accessToken);
    setOverview(loaded);
  }

  async function loadUsers() {
    if (!accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await getAdminUsers(accessToken, { page, pageSize, search, role: roleFilter });
      setUsersPage(loaded);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Не удалось загрузить пользователей.';
      setError(message);
      toast.error('Пользователи не загрузились', message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRoles() {
    if (!accessToken || !selectedUser) return;
    if (selectedUser.roles.includes('Admin') && !roleDraft.includes('Admin')) {
      const confirmed = window.confirm('Снять роль администратора? Проверьте, что останется другой администратор.');
      if (!confirmed) return;
    }

    setSavingUserId(selectedUser.id);
    try {
      const updated = await updateUserRoles(accessToken, selectedUser.id, roleDraft);
      setSelectedUser(updated);
      setUsersPage((current) => current ? { ...current, items: current.items.map((item) => item.id === updated.id ? updated : item) } : current);
      await loadOverview();
      toast.success('Роли обновлены', `${updated.displayName}: ${updated.roles.map(formatRole).join(', ') || 'без ролей'}.`);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить роли.';
      toast.error('Роли не сохранены', message);
    } finally {
      setSavingUserId(null);
    }
  }

  function updateUserInList(updated: AdminUser) {
    setSelectedUser((current) => current?.id === updated.id ? updated : current);
    setUsersPage((current) => current ? {
      ...current,
      items: current.items.map((item) => item.id === updated.id ? updated : item),
    } : current);
  }

  async function saveProfile() {
    if (!accessToken || !selectedUser) return;
    setSavingUserId(selectedUser.id);
    try {
      const updated = await updateAdminUser(accessToken, selectedUser.id, {
        ...profileDraft,
        phoneNumber: normalizePhone(profileDraft.phoneNumber),
      });
      updateUserInList(updated);
      toast.success('Пользователь обновлен', updated.displayName);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить пользователя.';
      toast.error('Пользователь не сохранен', message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function removeUser(user: AdminUser) {
    if (!accessToken) return;
    setSavingUserId(user.id);
    try {
      await deleteAdminUser(accessToken, user.id);
      setUsersPage((current) => current ? {
        ...current,
        totalItems: Math.max(current.totalItems - 1, 0),
        items: current.items.filter((item) => item.id !== user.id),
      } : current);
      if (selectedUser?.id === user.id) setSelectedUser(null);
      setDeleteTarget(null);
      await loadOverview();
      toast.success('Пользователь удален', user.displayName);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Не удалось удалить пользователя.';
      toast.error('Пользователь не удален', message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function linkRegistration() {
    if (!accessToken || !selectedUser || !linkRegistrationId.trim()) return;
    setSavingUserId(selectedUser.id);
    try {
      const updated = await linkAdminRegistrationToUser(accessToken, linkRegistrationId.trim(), selectedUser.id);
      updateUserInList(updated);
      setLinkRegistrationId('');
      toast.success('Заявка привязана', `Заявка теперь относится к ${updated.displayName}.`);
    } catch (linkError) {
      const message = linkError instanceof Error ? linkError.message : 'Не удалось привязать заявку.';
      toast.error('Заявка не привязана', message);
    } finally {
      setSavingUserId(null);
    }
  }

  async function mergeUser() {
    if (!accessToken || !selectedUser || !mergeTargetUserId.trim()) return;
    const confirmed = window.confirm('Объединить пользователя с целевым аккаунтом? Заявки и внешние входы будут перенесены, исходный аккаунт удалится.');
    if (!confirmed) return;

    setSavingUserId(selectedUser.id);
    try {
      const updatedTarget = await mergeAdminUsers(accessToken, selectedUser.id, mergeTargetUserId.trim());
      setUsersPage((current) => current ? {
        ...current,
        totalItems: Math.max(current.totalItems - 1, 0),
        items: current.items
          .filter((item) => item.id !== selectedUser.id)
          .map((item) => item.id === updatedTarget.id ? updatedTarget : item),
      } : current);
      setSelectedUser(updatedTarget);
      setMergeTargetUserId('');
      await loadOverview();
      toast.success('Пользователи объединены', `Данные перенесены в ${updatedTarget.displayName}.`);
    } catch (mergeError) {
      const message = mergeError instanceof Error ? mergeError.message : 'Не удалось объединить пользователей.';
      toast.error('Пользователи не объединены', message);
    } finally {
      setSavingUserId(null);
    }
  }

  const users = usersPage?.items ?? [];

  return (
    <div className="admin-workspace-stack">
      <DataToolbar>
        <label><span>Поиск</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Имя, email, город, церковь" /></label>
        <label>
          <span>Роль</span>
          <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as 'all' | AppRole); setPage(1); }}>
            <option value="all">Все роли</option>
            <option value="Member">Участники</option>
            <option value="CampManager">Координаторы</option>
            <option value="Admin">Администраторы</option>
          </select>
        </label>
        <button className="admin-reset-icon-button" type="button" aria-label="Сбросить фильтры" title="Сбросить фильтры" onClick={() => { setSearch(''); setRoleFilter('all'); setPage(1); }}>↺</button>
      </DataToolbar>

      {error ? <ErrorState message={error} /> : null}
      {isLoading && !usersPage ? <LoadingState title="Загружаем пользователей" /> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Пользователь</th><th>Роли</th><th>Город / церковь</th><th>Заявка</th><th>Последний вход</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className={user.roles.includes('Admin') ? 'admin-row-highlight' : undefined}
                onDoubleClick={() => setSelectedUser(user)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setContextMenu({ x: event.clientX, y: event.clientY, user });
                }}
              >
                <td><strong>{user.displayName}</strong><span>{user.email}</span></td>
                <td><div className="admin-chip-row">{user.roles.map((role) => <StatusBadge key={role} label={formatRole(role)} tone={role === 'Admin' ? 'success' : 'neutral'} />)}</div></td>
                <td><strong>{user.city || 'Не указан'}</strong><span>{user.churchName || 'Церковь не указана'}</span></td>
                <td><StatusBadge label={formatStatus(user.registrationStatus)} tone={statusTone(user.registrationStatus)} /></td>
                <td>{formatDateTime(user.lastLoginAtUtc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="admin-mobile-list">
          {users.map((user) => (
            <article className="admin-mobile-card" key={user.id}>
              <div><strong>{user.displayName}</strong><StatusBadge label={user.roles.includes('Admin') ? 'Admin' : 'Пользователь'} tone={user.roles.includes('Admin') ? 'success' : 'neutral'} /></div>
              <p>{user.email}</p>
              <button className="secondary-button" type="button" onClick={() => setSelectedUser(user)}>Открыть</button>
            </article>
          ))}
        </div>
      </div>

      {usersPage ? <Pagination page={usersPage.page} pageSize={usersPage.pageSize} totalItems={usersPage.totalItems} totalPages={usersPage.totalPages} isLoading={isLoading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /> : null}

      {!isLoading && usersPage && !users.length ? <EmptyState title="Пользователи не найдены" description="Попробуйте другой поиск или фильтр." /> : null}

      {contextMenu ? (
        <div className="admin-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <div>
            <button type="button" onClick={() => { setSelectedUser(contextMenu.user); setContextMenu(null); }}>Открыть</button>
            <button type="button" onClick={() => { setSelectedUser(contextMenu.user); setContextMenu(null); }}>Редактировать</button>
          </div>
          <div>
            <button type="button" onClick={() => { setSelectedUser(contextMenu.user); setContextMenu(null); setLinkRegistrationId(contextMenu.user.registrationId ?? ''); }}>Привязать заявку</button>
            <button type="button" onClick={() => { setSelectedUser(contextMenu.user); setContextMenu(null); }}>Объединить</button>
          </div>
          <div>
            <button
              className="danger"
              type="button"
              disabled={contextMenu.user.id === auth.account?.user.id}
              onClick={() => {
                setDeleteTarget(contextMenu.user);
                setContextMenu(null);
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      ) : null}

      <Drawer
        open={Boolean(selectedUser)}
        title={selectedUser?.displayName ?? 'Пользователь'}
        description={selectedUser?.email}
        onClose={() => setSelectedUser(null)}
        footer={
          selectedUser ? (
            <>
              <button className="secondary-button" type="button" disabled={savingUserId === selectedUser.id} onClick={() => setDeleteTarget(selectedUser)}>Удалить</button>
              <button className="secondary-button" type="button" disabled={!selectedUser || rolesEqual(roleDraft, selectedUser.roles)} onClick={() => setRoleDraft(orderRoles([...selectedUser.roles]))}>Сбросить роли</button>
              <button className="primary-button" type="button" disabled={savingUserId === selectedUser.id || rolesEqual(roleDraft, selectedUser.roles)} onClick={saveRoles}>{savingUserId === selectedUser.id ? 'Сохраняем...' : 'Сохранить роли'}</button>
            </>
          ) : null
        }
      >
        {selectedUser ? (
          <div className="admin-detail-stack">
            <FormSection title="Профиль">
              <div className="admin-form-grid">
                <label><span>Отображаемое имя</span><input value={profileDraft.displayName} onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))} /></label>
                <label><span>Телефон</span><input value={profileDraft.phoneNumber ?? ''} onChange={(event) => setProfileDraft((current) => ({ ...current, phoneNumber: formatPhoneForInput(event.target.value) }))} inputMode="tel" placeholder="+7 (000) 000 00 00" /></label>
                <label><span>Фамилия</span><input value={profileDraft.lastName} onChange={(event) => setProfileDraft((current) => ({ ...current, lastName: event.target.value }))} /></label>
                <label><span>Имя</span><input value={profileDraft.firstName} onChange={(event) => setProfileDraft((current) => ({ ...current, firstName: event.target.value }))} /></label>
                <label><span>Отчество</span><input value={profileDraft.patronymic ?? ''} onChange={(event) => setProfileDraft((current) => ({ ...current, patronymic: event.target.value }))} /></label>
                <label><span>Город</span><input value={profileDraft.city ?? ''} onChange={(event) => setProfileDraft((current) => ({ ...current, city: event.target.value }))} /></label>
                <label><span>Церковь</span><input value={profileDraft.churchName ?? ''} onChange={(event) => setProfileDraft((current) => ({ ...current, churchName: event.target.value }))} /></label>
              </div>
              <button className="secondary-button" type="button" disabled={savingUserId === selectedUser.id} onClick={saveProfile}>
                {savingUserId === selectedUser.id ? 'Сохраняем...' : 'Сохранить профиль'}
              </button>
            </FormSection>
            <FormSection title="Роли" description="Изменения применятся после сохранения.">
              <div className="admin-role-toggle-grid">
                {(overview?.roles ?? []).map((role) => (
                  <label className="role-toggle" key={role.id}>
                    <input
                      type="checkbox"
                      checked={roleDraft.includes(role.id)}
                      onChange={(event) => {
                        const next = new Set(roleDraft);
                        if (event.target.checked) next.add(role.id);
                        else next.delete(role.id);
                        setRoleDraft(orderRoles([...next] as AppRole[]));
                      }}
                    />
                    <div><strong>{role.title}</strong><span>{role.description}</span></div>
                  </label>
                ))}
              </div>
            </FormSection>
            <FormSection title="Внешние входы">
              <div className="admin-chip-row">
                {selectedUser.externalIdentities.length ? selectedUser.externalIdentities.map((identity) => <StatusBadge key={identity.provider} label={identity.provider} />) : <span className="form-muted">Нет внешних входов</span>}
              </div>
            </FormSection>
            <FormSection title="Привязка и объединение" description="Для точных действий используйте ID заявки или ID целевого пользователя. ID можно взять из таблиц админки или адреса API.">
              <div className="admin-form-grid">
                <label>
                  <span>ID заявки</span>
                  <input value={linkRegistrationId} onChange={(event) => setLinkRegistrationId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
                </label>
                <div className="admin-inline-action">
                  <button className="secondary-button" type="button" disabled={savingUserId === selectedUser.id || !linkRegistrationId.trim()} onClick={linkRegistration}>Привязать к этому пользователю</button>
                </div>
                <label>
                  <span>ID пользователя для объединения</span>
                  <input value={mergeTargetUserId} onChange={(event) => setMergeTargetUserId(event.target.value)} placeholder="Целевой пользователь" />
                </label>
                <div className="admin-inline-action">
                  <button className="secondary-button" type="button" disabled={savingUserId === selectedUser.id || !mergeTargetUserId.trim()} onClick={mergeUser}>Объединить в целевого пользователя</button>
                </div>
              </div>
            </FormSection>
            <FormSection title="Заявка пользователя">
              <RegistrationDetails registration={selectedUser} statusDraft={selectedUser.registrationStatus ?? 'Draft'} onStatusDraftChange={() => undefined} />
            </FormSection>
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Удалить пользователя?"
        description={deleteTarget ? `Аккаунт ${deleteTarget.displayName} будет удален. Связанные данные удалятся или будут перенесены только через объединение.` : undefined}
        confirmLabel={savingUserId === deleteTarget?.id ? 'Удаляем...' : 'Удалить'}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget ? void removeUser(deleteTarget) : undefined}
      />
    </div>
  );
}

function RolesSection({ accessToken }: { accessToken: string | null }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      setIsLoading(true);
      try {
        setOverview(await getAdminOverview(accessToken));
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : 'Не удалось загрузить роли.';
        setError(message);
        toast.error('Роли не загрузились', message);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [accessToken, toast]);

  if (isLoading) return <LoadingState title="Загружаем роли" />;
  if (error) return <ErrorState message={error} />;
  if (!overview) return <EmptyState title="Роли не найдены" />;

  return (
    <div className="admin-workspace-stack">
      <AdminSectionHeader eyebrow="Справочник" title="Роли команды" description="Роль, описание, количество участников и быстрый переход к фильтру пользователей." />
      <div className="admin-role-directory">
        {overview.roles.map((role) => (
          <article className="admin-panel" key={role.id}>
            <div className="admin-role-row-head">
              <div><h3>{role.title}</h3><p>{role.description}</p></div>
              <strong>{role.assignedUserCount}</strong>
            </div>
            <div className="admin-chip-row">
              {role.memberDisplayNames.length ? role.memberDisplayNames.map((name) => <span className="role-pill" key={`${role.id}-${name}`}>{name}</span>) : <span className="role-pill muted-pill">Пока никого нет</span>}
            </div>
            <button className="secondary-button" type="button" onClick={() => navigate(`/admin/users?role=${role.id}`)}>
              Открыть пользователей
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function AuthProvidersSection({ accessToken }: { accessToken: string | null }) {
  const toast = useToast();
  const [settings, setSettings] = useState<AdminExternalAuthSettings | null>(null);
  const [drafts, setDrafts] = useState<Record<string, UpdateExternalAuthProviderRequest>>({});
  const [selectedProvider, setSelectedProvider] = useState<AdminExternalAuthProvider | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [pendingTest, setPendingTest] = useState<{ provider: string; state: string; mode: 'oauth' | 'telegram' } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void loadSettings();
  }, [accessToken]);

  useEffect(() => {
    if (!pendingTest) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = pendingTest.mode === 'telegram' ? await getTelegramAuthStatus(pendingTest.state) : await getExternalAuthStatus(pendingTest.state);
        if (cancelled || !response.completed) return;
        toast.success('Проверка пройдена', response.message ?? `${pendingTest.provider} работает.`);
        setPendingTest(null);
        setTestingProvider(null);
        await loadSettings(true);
      } catch (pollError) {
        if (!cancelled) {
          const message = pollError instanceof Error ? pollError.message : 'Проверка не завершилась.';
          toast.error('Проверка провайдера не прошла', message);
          setPendingTest(null);
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
  }, [pendingTest, toast]);

  async function loadSettings(silent = false) {
    if (!accessToken) return;
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const loaded = await getAdminExternalAuthSettings(accessToken);
      setSettings(loaded);
      setDrafts(Object.fromEntries(loaded.providers.map((provider) => [provider.provider, createExternalAuthProviderDraft(provider)])));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Не удалось загрузить провайдеры.';
      setError(message);
      toast.error('Auth недоступен', message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  function getDraft(provider: AdminExternalAuthProvider) {
    return drafts[provider.provider] ?? createExternalAuthProviderDraft(provider);
  }

  function updateDraft(provider: string, patch: Partial<UpdateExternalAuthProviderRequest>) {
    setDrafts((current) => ({ ...current, [provider]: { ...current[provider], ...patch } }));
  }

  async function saveProvider(provider: AdminExternalAuthProvider) {
    if (!accessToken) return;
    setSavingProvider(provider.provider);
    try {
      const updated = await updateAdminExternalAuthProvider(accessToken, provider.provider, getDraft(provider));
      setSettings((current) => current ? { ...current, providers: current.providers.map((item) => item.provider === updated.provider ? updated : item) } : current);
      setDrafts((current) => ({ ...current, [updated.provider]: createExternalAuthProviderDraft(updated) }));
      setSelectedProvider(updated);
      toast.success('Провайдер сохранен', updated.displayName);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить провайдера.';
      toast.error('Не сохранено', message);
    } finally {
      setSavingProvider(null);
    }
  }

  async function testProvider(provider: AdminExternalAuthProvider) {
    if (!accessToken) return;
    setTestingProvider(provider.provider);
    try {
      const started = await startAdminExternalAuthProviderTest(accessToken, provider.provider);
      window.open(started.authUrl, `${provider.provider}-auth-test`, 'width=560,height=720');
      setPendingTest({ provider: provider.provider, state: started.state, mode: provider.provider === 'telegram' ? 'telegram' : 'oauth' });
      toast.info('Проверка запущена', 'Завершите вход во всплывающем окне или Telegram.');
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : 'Не удалось запустить проверку.';
      toast.error('Проверка не запущена', message);
      setTestingProvider(null);
    }
  }

  if (isLoading) return <LoadingState title="Загружаем провайдеры входа" />;
  if (error) return <ErrorState message={error} />;
  if (!settings) return <EmptyState title="Провайдеры не найдены" />;

  return (
    <div className="admin-workspace-stack">
      <div className="admin-compact-heading">
        <div>
          <h2>Провайдеры входа</h2>
          <p>Статус, диагностика и настройки внешней авторизации.</p>
        </div>
        <StatusBadge label={`${settings.providers.filter((provider) => provider.enabled).length} включено`} tone="info" />
      </div>
      <div className="admin-provider-grid">
        {settings.providers.map((provider) => (
          <article className="admin-panel" key={provider.provider}>
            <div className="admin-role-row-head">
              <div><h3>{provider.displayName}</h3><p>{provider.mode === 'telegram' ? 'Telegram bot/widget' : 'OAuth 2.0'}</p></div>
              <StatusBadge label={provider.ready ? 'Готов' : 'Не готов'} tone={provider.ready ? 'success' : 'warning'} />
            </div>
            <div className="admin-chip-row">
              <StatusBadge label={provider.enabled ? 'Включен' : 'Выключен'} tone={provider.enabled ? 'success' : 'muted'} />
              {provider.diagnostics.map((diagnostic) => <StatusBadge key={diagnostic.key} label={diagnostic.title} tone={diagnostic.ok ? 'success' : 'warning'} />)}
            </div>
            <div className="admin-row-actions">
              <button className="secondary-button" type="button" onClick={() => setSelectedProvider(provider)}>Настроить</button>
              <button className="primary-button" type="button" disabled={!provider.ready || testingProvider === provider.provider} onClick={() => testProvider(provider)}>
                {testingProvider === provider.provider ? 'Проверяем...' : 'Проверить'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="admin-panel">
        <div className="admin-panel-headline">
          <h3>Последние события входа</h3>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Провайдер</th><th>Событие</th><th>Детали</th><th>Дата</th></tr></thead>
            <tbody>
              {settings.recentEvents.map((event) => (
                <tr key={event.id}><td>{event.provider}</td><td>{event.eventType}</td><td>{event.detail || 'Без деталей'}</td><td>{formatDateTime(event.createdAtUtc)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Drawer
        open={Boolean(selectedProvider)}
        title={selectedProvider?.displayName ?? 'Провайдер'}
        description="Секреты можно оставить пустыми, чтобы не менять существующее значение."
        onClose={() => setSelectedProvider(null)}
        footer={selectedProvider ? <button className="primary-button" type="button" disabled={savingProvider === selectedProvider.provider} onClick={() => saveProvider(selectedProvider)}>{savingProvider === selectedProvider.provider ? 'Сохраняем...' : 'Сохранить'}</button> : null}
      >
        {selectedProvider ? (
          <ProviderForm provider={selectedProvider} draft={getDraft(selectedProvider)} onChange={(patch) => updateDraft(selectedProvider.provider, patch)} />
        ) : null}
      </Drawer>
    </div>
  );
}

function ProviderForm({ provider, draft, onChange }: { provider: AdminExternalAuthProvider; draft: UpdateExternalAuthProviderRequest; onChange: (patch: Partial<UpdateExternalAuthProviderRequest>) => void }) {
  return (
    <div className="admin-detail-stack">
      <FormSection title="Состояние">
        <label className="checkbox-row"><input type="checkbox" checked={draft.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} /><span>Включить {provider.displayName}</span></label>
        {provider.mode === 'telegram' ? <label className="checkbox-row"><input type="checkbox" checked={Boolean(draft.widgetEnabled)} onChange={(event) => onChange({ widgetEnabled: event.target.checked })} /><span>Включить Telegram Widget</span></label> : null}
      </FormSection>
      {provider.mode === 'oauth' ? (
        <FormSection title="OAuth">
          <label><span>Client ID</span><input value={draft.clientId ?? ''} onChange={(event) => onChange({ clientId: event.target.value })} /></label>
          <label><span>Client Secret</span><input value={draft.clientSecret ?? ''} placeholder={provider.clientSecretMasked || 'Оставьте пустым, чтобы не менять'} onChange={(event) => onChange({ clientSecret: event.target.value })} /></label>
          <div className="admin-detail-grid"><div><span>Callback URL</span><strong>{provider.callbackUrl || 'Не задан'}</strong></div></div>
        </FormSection>
      ) : (
        <FormSection title="Telegram">
          <label><span>Bot username</span><input value={draft.botUsername ?? ''} onChange={(event) => onChange({ botUsername: event.target.value })} /></label>
          <label><span>Bot token</span><input value={draft.botToken ?? ''} placeholder={provider.botTokenMasked || 'Оставьте пустым'} onChange={(event) => onChange({ botToken: event.target.value })} /></label>
          <label><span>Webhook secret</span><input value={draft.webhookSecret ?? ''} placeholder={provider.webhookSecretMasked || 'Секрет webhook'} onChange={(event) => onChange({ webhookSecret: event.target.value })} /></label>
          <div className="admin-detail-grid"><div><span>Webhook URL</span><strong>{provider.webhookUrl || 'Не задан'}</strong></div></div>
        </FormSection>
      )}
      <FormSection title="Диагностика">
        <div className="admin-detail-stack">
          {provider.diagnostics.map((diagnostic) => (
            <article className="admin-inline-diagnostic" key={diagnostic.key}>
              <StatusBadge label={diagnostic.ok ? 'OK' : 'Внимание'} tone={diagnostic.ok ? 'success' : 'warning'} />
              <div><strong>{diagnostic.title}</strong><p>{diagnostic.message || 'Проверка пройдена.'}</p></div>
            </article>
          ))}
        </div>
      </FormSection>
    </div>
  );
}
