import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  deleteAdminRegistration,
  getAdminEvents,
  getAdminExternalAuthSettings,
  getAdminOverview,
  getAdminRegistrations,
  getAdminUsers,
  getExternalAuthStatus,
  getTelegramAuthStatus,
  startAdminExternalAuthProviderTest,
  updateAdminExternalAuthProvider,
  updateAdminRegistrationStatus,
  updateUserRoles,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import type {
  AdminEventSummary,
  AdminExternalAuthProvider,
  AdminExternalAuthSettings,
  AdminOverview,
  AdminUser,
  AppRole,
  PaginatedResponse,
  RegistrationStatus,
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
  StatCard,
  StatusBadge,
  type AdminNavItem,
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

const adminNavItems: AdminNavItem[] = [
  { to: '/admin', label: 'Обзор', description: 'Сводка и внимание', group: 'Обзор' },
  { to: '/admin/registrations', label: 'Заявки', description: 'Участие и статусы', group: 'Участники' },
  { to: '/admin/users', label: 'Пользователи', description: 'Аккаунты и доступ', group: 'Участники' },
  { to: '/admin/roles', label: 'Роли', description: 'Состав команды', group: 'Участники' },
  { to: '/admin/events', label: 'Мероприятия', description: 'Сезоны и тарифы', group: 'Контент' },
  { to: '/admin/gallery', label: 'Медиатека', description: 'Фото и файлы', group: 'Контент' },
  { to: '/admin/site', label: 'Сайт', description: 'Ссылки и контакты', group: 'Контент' },
  { to: '/admin/telegram', label: 'Telegram', description: 'Чаты и уведомления', group: 'Интеграции' },
  { to: '/admin/auth', label: 'Вход', description: 'Провайдеры auth', group: 'Интеграции' },
  { to: '/admin/backups', label: 'Бэкапы', description: 'Резервные копии', group: 'Система' },
];

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
        eyebrow: 'Администрирование',
        title: 'Рабочая сводка лагеря',
        description: 'Короткая панель контроля: заявки, участники, мероприятия, интеграции и быстрые действия.',
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
      activePath={location.pathname}
      accessLabel={auth.account?.user.displayName ?? 'Администратор'}
      description={meta.description}
      eyebrow={meta.eyebrow}
      items={adminNavItems}
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
  const navigate = useNavigate();
  const toast = useToast();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [authSettings, setAuthSettings] = useState<AdminExternalAuthSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [overviewResponse, eventsResponse, authResponse] = await Promise.all([
          getAdminOverview(accessToken),
          getAdminEvents(accessToken),
          getAdminExternalAuthSettings(accessToken),
        ]);
        if (cancelled) return;
        setOverview(overviewResponse);
        setEvents(eventsResponse.events);
        setAuthSettings(authResponse);
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
  const brokenProviders = authSettings?.providers.filter((provider) => provider.enabled && !provider.ready) ?? [];

  return (
    <div className="admin-workspace-stack">
      <section className="admin-kpi-grid">
        <StatCard label="Пользователи" value={overview.stats.totalUsers} hint="Всего аккаунтов" />
        <StatCard label="Все заявки" value={overview.stats.totalRegistrations} hint="По активному лагерю" />
        <StatCard label="Ждут внимания" value={overview.stats.submittedRegistrations} hint="Статус Отправлено" tone="warning" />
        <StatCard label="Подтверждены" value={overview.stats.confirmedRegistrations} hint="Занимают места" tone="success" />
        <StatCard label="Открыта регистрация" value={openEvents.length} hint="Активные события" />
        <StatCard label="Ближайшее закрытие" value={nearestClosing ? formatDateTime(nearestClosing.registrationClosesAtUtc) : 'Нет'} hint={nearestClosing?.title} />
      </section>

      <section className="admin-two-column">
        <article className="admin-panel">
          <AdminSectionHeader eyebrow="Фокус" title="Что требует внимания" />
          <div className="admin-attention-list">
            <button type="button" onClick={() => navigate('/admin/registrations?status=Submitted')}>
              <strong>{overview.stats.submittedRegistrations}</strong>
              <span>отправленных заявок ждут решения</span>
            </button>
            <button type="button" onClick={() => navigate('/admin/events')}>
              <strong>{openEvents.length}</strong>
              <span>мероприятий сейчас принимают заявки</span>
            </button>
            <button type="button" onClick={() => navigate('/admin/auth')}>
              <strong>{brokenProviders.length}</strong>
              <span>включенных auth-провайдеров требуют настройки</span>
            </button>
          </div>
        </article>

        <article className="admin-panel">
          <AdminSectionHeader eyebrow="Быстро" title="Действия администратора" />
          <div className="admin-quick-actions">
            <button className="primary-button" type="button" onClick={() => navigate('/admin/events')}>
              Создать мероприятие
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate('/admin/registrations')}>
              Открыть заявки
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate('/admin/users')}>
              Пользователи
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate('/admin/gallery')}>
              Загрузить медиа
            </button>
            <button className="secondary-button" type="button" onClick={() => navigate('/admin/backups')}>
              Создать бэкап
            </button>
          </div>
        </article>
      </section>

      <section className="admin-panel">
        <AdminSectionHeader eyebrow="Роли" title="Команда и доступ" description="Краткий срез по текущим ролям." />
        <div className="admin-role-summary-grid">
          {overview.roles.map((role) => (
            <article key={role.id}>
              <strong>{role.title}</strong>
              <span>{role.assignedUserCount}</span>
              <p>{role.description}</p>
            </article>
          ))}
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
  const [pageSize, setPageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<AdminUser | null>(null);
  const [statusDraft, setStatusDraft] = useState<RegistrationStatus>('Submitted');
  const [savingRegistrationId, setSavingRegistrationId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
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

  return (
    <div className="admin-workspace-stack">
      <AdminSectionHeader
        eyebrow="Очередь"
        title="Работа с заявками"
        description="Фильтруйте, открывайте детали в панели справа и меняйте статус явным сохранением."
      />

      <DataToolbar>
        <label>
          <span>Поиск</span>
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Имя, email, телефон, город" />
        </label>
        <label>
          <span>Статус</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value as 'all' | RegistrationStatus); setPage(1); }}>
            <option value="all">Все статусы</option>
            <option value="Submitted">Отправлено</option>
            <option value="Confirmed">Подтверждено</option>
            <option value="Cancelled">Отменено</option>
            <option value="Draft">Черновики</option>
          </select>
        </label>
        <label>
          <span>Мероприятие</span>
          <select value={eventId} onChange={(event) => { setEventId(event.target.value); setPage(1); }}>
            <option value="all">Все мероприятия</option>
            {events.map((event) => (
              <option value={event.id} key={event.id}>{event.title}</option>
            ))}
          </select>
        </label>
        <button className="secondary-button" type="button" onClick={() => { setSearch(''); setStatus('all'); setEventId('all'); setPage(1); }}>
          Сбросить
        </button>
      </DataToolbar>

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
                <th>Статус</th>
                <th>Тариф</th>
                <th>Обновлено</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((registration) => (
                <tr key={registration.id}>
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
                  <td><StatusBadge label={formatStatus(registration.registrationStatus)} tone={statusTone(registration.registrationStatus)} /></td>
                  <td>
                    <strong>{registration.registrationSelectedPriceOptionTitle || 'Не выбран'}</strong>
                    <span>{formatMoney(registration.registrationSelectedPriceOptionAmount, registration.registrationSelectedPriceOptionCurrency ?? 'RUB')}</span>
                  </td>
                  <td>{formatDateTime(registration.registrationUpdatedAtUtc)}</td>
                  <td>
                    <div className="admin-row-actions">
                      <button className="secondary-button" type="button" onClick={() => setSelectedRegistration(registration)}>Открыть</button>
                      {registration.registrationId ? (
                        <button className="danger-link" type="button" onClick={() => setDeleteTarget(registration)}>Удалить</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
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
        </div>
      </FormSection>
    </div>
  );
}

function UsersSection({ accessToken }: { accessToken: string | null }) {
  const toast = useToast();
  const location = useLocation();
  const queryRole = new URLSearchParams(location.search).get('role') as AppRole | null;
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [usersPage, setUsersPage] = useState<PaginatedResponse<AdminUser> | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | AppRole>(
    queryRole && queryRole in roleLabels ? queryRole : 'all',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [roleDraft, setRoleDraft] = useState<AppRole[]>([]);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
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
  }, [selectedUser]);

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

  const users = usersPage?.items ?? [];

  return (
    <div className="admin-workspace-stack">
      <AdminSectionHeader eyebrow="Аккаунты" title="Управление пользователями" description="Роли редактируются в боковой панели, список остается компактным." />
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
        <button className="secondary-button" type="button" onClick={() => { setSearch(''); setRoleFilter('all'); setPage(1); }}>Сбросить</button>
      </DataToolbar>

      {usersPage ? <Pagination page={usersPage.page} pageSize={usersPage.pageSize} totalItems={usersPage.totalItems} totalPages={usersPage.totalPages} isLoading={isLoading} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /> : null}
      {error ? <ErrorState message={error} /> : null}
      {isLoading && !usersPage ? <LoadingState title="Загружаем пользователей" /> : null}

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>Пользователь</th><th>Роли</th><th>Город / церковь</th><th>Заявка</th><th>Последний вход</th><th>Действия</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={user.roles.includes('Admin') ? 'admin-row-highlight' : undefined}>
                <td><strong>{user.displayName}</strong><span>{user.email}</span></td>
                <td><div className="admin-chip-row">{user.roles.map((role) => <StatusBadge key={role} label={formatRole(role)} tone={role === 'Admin' ? 'success' : 'neutral'} />)}</div></td>
                <td><strong>{user.city || 'Не указан'}</strong><span>{user.churchName || 'Церковь не указана'}</span></td>
                <td><StatusBadge label={formatStatus(user.registrationStatus)} tone={statusTone(user.registrationStatus)} /></td>
                <td>{formatDateTime(user.lastLoginAtUtc)}</td>
                <td><button className="secondary-button" type="button" onClick={() => setSelectedUser(user)}>Открыть</button></td>
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

      {!isLoading && usersPage && !users.length ? <EmptyState title="Пользователи не найдены" description="Попробуйте другой поиск или фильтр." /> : null}

      <Drawer
        open={Boolean(selectedUser)}
        title={selectedUser?.displayName ?? 'Пользователь'}
        description={selectedUser?.email}
        onClose={() => setSelectedUser(null)}
        footer={
          selectedUser ? (
            <>
              <button className="secondary-button" type="button" disabled={!selectedUser || rolesEqual(roleDraft, selectedUser.roles)} onClick={() => setRoleDraft(orderRoles([...selectedUser.roles]))}>Сбросить</button>
              <button className="primary-button" type="button" disabled={savingUserId === selectedUser.id || rolesEqual(roleDraft, selectedUser.roles)} onClick={saveRoles}>{savingUserId === selectedUser.id ? 'Сохраняем...' : 'Сохранить роли'}</button>
            </>
          ) : null
        }
      >
        {selectedUser ? (
          <div className="admin-detail-stack">
            <FormSection title="Профиль">
              <div className="admin-detail-grid">
                <div><span>Имя</span><strong>{selectedUser.displayName}</strong></div>
                <div><span>Email</span><strong>{selectedUser.email}</strong></div>
                <div><span>Город</span><strong>{selectedUser.city || 'Не указан'}</strong></div>
                <div><span>Церковь</span><strong>{selectedUser.churchName || 'Не указана'}</strong></div>
              </div>
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
            <FormSection title="Заявка пользователя">
              <RegistrationDetails registration={selectedUser} statusDraft={selectedUser.registrationStatus ?? 'Draft'} onStatusDraftChange={() => undefined} />
            </FormSection>
          </div>
        ) : null}
      </Drawer>
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
      <AdminSectionHeader eyebrow="Auth" title="Провайдеры входа" description="Настройка спрятана в панели, карточки показывают готовность и диагностику." />
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
        <AdminSectionHeader eyebrow="Журнал" title="Последние события входа" />
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
