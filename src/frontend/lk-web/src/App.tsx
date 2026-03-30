import { useEffect, useState, type FormEvent } from 'react';
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
import { ApiError, getAdminOverview, updateUserRoles } from './lib/api';
import type {
  AccommodationPreference,
  AdminOverview,
  AdminRoleDefinition,
  AdminUser,
  AppRole,
  CampRegistration,
  RegistrationStatus,
  SaveRegistrationRequest,
  UpdateProfileRequest,
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
          <NavLink to="/camp-registration">Заявка в лагерь</NavLink>
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
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    displayName: '',
  });

  useEffect(() => {
    if (auth.isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [auth.isAuthenticated, navigate]);

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
      } else {
        await auth.register({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          displayName: form.displayName || undefined,
        });
      }

      navigate('/dashboard', { replace: true, state: { from: location.pathname } });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось выполнить действие.');
    } finally {
      setIsSubmitting(false);
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
        </section>
      </div>
    </div>
  );
}

function DashboardPage() {
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

function ProfilePage() {
  const { account, updateProfile } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSaving(true);

    try {
      await updateProfile(form);
      setMessage('Профиль сохранен.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось сохранить профиль.');
    } finally {
      setIsSaving(false);
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
    </div>
  );
}

function CampRegistrationPage() {
  const auth = useAuth();
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
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить анкету.');
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
      setMessage(submitMode ? 'Анкета отправлена команде.' : 'Черновик сохранен.');
    } catch (submitError) {
      const nextError =
        submitError instanceof ApiError
          ? submitError.message
          : submitError instanceof Error
            ? submitError.message
            : 'Не удалось сохранить анкету.';
      setError(nextError);
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

function AdminPage() {
  const auth = useAuth();
  const canOpenAdmin = isAdmin(auth.account?.user.roles);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AppRole[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canOpenAdmin || !auth.session) {
      setIsLoading(false);
      return;
    }

    void loadOverview();
  }, [auth.session?.accessToken, canOpenAdmin]);

  async function loadOverview() {
    if (!auth.session) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await getAdminOverview(auth.session.accessToken);
      setOverview(loaded);
      setRoleDrafts(
        Object.fromEntries(loaded.users.map((user) => [user.id, orderRoles([...user.roles])])) as Record<
          string,
          AppRole[]
        >,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить админский раздел.');
    } finally {
      setIsLoading(false);
    }
  }

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

  async function saveRoles(user: AdminUser) {
    if (!auth.session) {
      return;
    }

    setMessage(null);
    setError(null);
    setSavingUserId(user.id);

    try {
      const updatedUser = await updateUserRoles(auth.session.accessToken, user.id, getDraftRoles(user));
      setOverview((current) =>
        current
          ? {
              ...current,
              users: current.users.map((item) => (item.id === updatedUser.id ? updatedUser : item)),
            }
          : current,
      );
      setRoleDrafts((current) => ({
        ...current,
        [updatedUser.id]: orderRoles([...updatedUser.roles]),
      }));
      setMessage(`Права пользователя ${updatedUser.displayName} обновлены.`);

      if (auth.account?.user.id === updatedUser.id) {
        await auth.reloadAccount();
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Не удалось обновить роли пользователя.');
    } finally {
      setSavingUserId(null);
    }
  }

  if (!canOpenAdmin) {
    return <Navigate replace to="/dashboard" />;
  }

  return (
    <div className="page-stack">
      <header className="page-hero glass-card">
        <div>
          <p className="mini-eyebrow">Администрирование</p>
          <h2>Права, роли и состояние лагеря</h2>
          <p>
            Здесь заложен базовый админский контур: структура ролей, обзор базы пользователей и
            настройка прав доступа для команды проекта.
          </p>
        </div>

        <div className="status-badge">
          <span>Ваш доступ</span>
          <strong>{formatRoleList(auth.account?.user.roles)}</strong>
        </div>
      </header>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <div className="glass-card stack-form">
          <p className="form-muted">Загружаем пользователей, роли и сводку по поездке...</p>
        </div>
      ) : overview ? (
        <>
          <section className="dashboard-grid admin-stats-grid">
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

          <section className="role-grid">
            {overview.roles.map((role) => (
              <article className="glass-card role-card" key={role.id}>
                <p className="mini-eyebrow">Роль</p>
                <h3>{role.title}</h3>
                <p>{role.description}</p>
              </article>
            ))}
          </section>

          <section className="glass-card stack-form">
            <div className="section-inline">
              <div>
                <p className="mini-eyebrow">Пользователи</p>
                <h3>Настройка прав доступа</h3>
              </div>
              <p className="form-muted">
                Последний администратор защищен от случайного снятия прав.
              </p>
            </div>

            <div className="user-list">
              {overview.users.map((user) => {
                const draftRoles = getDraftRoles(user);
                const isDirty = !rolesEqual(draftRoles, orderRoles([...user.roles]));
                const isSavingThisUser = savingUserId === user.id;

                return (
                  <article className="user-card" key={user.id}>
                    <div className="user-card-head">
                      <div>
                        <strong className="user-name">{user.displayName}</strong>
                        <p className="user-meta">{user.email}</p>
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
      </Route>

      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
