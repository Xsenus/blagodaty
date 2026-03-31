import { useEffect, useMemo, useState } from 'react';
import {
  createAdminTelegramSubscription,
  deleteAdminTelegramSubscription,
  getAdminTelegramOverview,
  updateAdminTelegramChat,
  updateAdminTelegramSubscription,
} from '../lib/api';
import type {
  AdminTelegramChat,
  AdminTelegramCommandLog,
  AdminTelegramOverview,
  TelegramChatKind,
  TelegramChatSubscriptionType,
} from '../types';
import { useToast } from '../ui/ToastProvider';

type AdminTelegramSectionProps = {
  accessToken: string | null;
  isActive: boolean;
};

const subscriptionTypeOptions: Array<{ value: TelegramChatSubscriptionType; label: string }> = [
  { value: 'RegistrationSubmitted', label: 'Новые заявки' },
  { value: 'RegistrationStatusChanged', label: 'Смена статусов' },
  { value: 'RegistrationClosingSoon', label: 'Скоро закрывается регистрация' },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Пока нет';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatChatKind(kind: TelegramChatKind) {
  switch (kind) {
    case 'Private':
      return 'Личный чат';
    case 'Group':
      return 'Группа';
    case 'Supergroup':
      return 'Супергруппа';
    case 'Channel':
      return 'Канал';
    default:
      return 'Неизвестный чат';
  }
}

function formatSubscriptionType(type: TelegramChatSubscriptionType) {
  switch (type) {
    case 'RegistrationSubmitted':
      return 'Новые заявки';
    case 'RegistrationStatusChanged':
      return 'Смена статусов';
    case 'RegistrationClosingSoon':
      return 'Скоро закрывается регистрация';
    default:
      return type;
  }
}

function formatCommandUser(log: AdminTelegramCommandLog) {
  if (log.userDisplayName) {
    return log.userDisplayName;
  }

  if (log.telegramUsername) {
    return `@${log.telegramUsername.replace(/^@+/, '')}`;
  }

  if (log.telegramUserId) {
    return String(log.telegramUserId);
  }

  return 'Неизвестный пользователь';
}

export function AdminTelegramSection({ accessToken, isActive }: AdminTelegramSectionProps) {
  const toast = useToast();
  const [overview, setOverview] = useState<AdminTelegramOverview | null>(null);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedType, setSelectedType] = useState<TelegramChatSubscriptionType>('RegistrationSubmitted');
  const [threadIdInput, setThreadIdInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingChatId, setSavingChatId] = useState<string | null>(null);
  const [savingSubscriptionId, setSavingSubscriptionId] = useState<string | null>(null);
  const [deletingSubscriptionId, setDeletingSubscriptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || !accessToken) {
      return;
    }

    void loadOverview();
  }, [accessToken, isActive]);

  const chatOptions = overview?.chats ?? [];
  const eventOptions = overview?.events ?? [];

  useEffect(() => {
    if (!selectedChatId && chatOptions.length) {
      setSelectedChatId(chatOptions[0].id);
    }
  }, [chatOptions, selectedChatId]);

  useEffect(() => {
    if (!selectedEventId && eventOptions.length) {
      setSelectedEventId(eventOptions[0].id);
    }
  }, [eventOptions, selectedEventId]);

  const selectedChat = useMemo(
    () => chatOptions.find((item) => item.id === selectedChatId) ?? null,
    [chatOptions, selectedChatId],
  );

  async function loadOverview() {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await getAdminTelegramOverview(accessToken);
      setOverview(loaded);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить Telegram-раздел.';
      setError(nextError);
      toast.error('Не удалось открыть Telegram-раздел', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateSubscription() {
    if (!accessToken || !selectedChatId || !selectedEventId) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const parsedThreadId = threadIdInput.trim() ? Number(threadIdInput.trim()) : null;
      await createAdminTelegramSubscription(accessToken, {
        telegramChatId: selectedChatId,
        eventEditionId: selectedEventId,
        subscriptionType: selectedType,
        messageThreadId: Number.isFinite(parsedThreadId) ? parsedThreadId : null,
        isEnabled: true,
      });

      setThreadIdInput('');
      await loadOverview();
      toast.success('Подписка сохранена', 'Telegram-чат уже привязан к выбранному событию.');
    } catch (createError) {
      const nextError = createError instanceof Error ? createError.message : 'Не удалось сохранить подписку.';
      setError(nextError);
      toast.error('Не удалось сохранить подписку', nextError);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleChat(chat: AdminTelegramChat) {
    if (!accessToken) {
      return;
    }

    setSavingChatId(chat.id);
    setError(null);

    try {
      await updateAdminTelegramChat(accessToken, chat.id, {
        isActive: !chat.isActive,
      });

      await loadOverview();
      toast.success(chat.isActive ? 'Чат выключен' : 'Чат включён');
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось обновить чат.';
      setError(nextError);
      toast.error('Не удалось обновить чат', nextError);
    } finally {
      setSavingChatId(null);
    }
  }

  async function handleToggleSubscription(chat: AdminTelegramChat, subscriptionId: string, isEnabled: boolean, messageThreadId?: number | null) {
    if (!accessToken) {
      return;
    }

    setSavingSubscriptionId(subscriptionId);
    setError(null);

    try {
      await updateAdminTelegramSubscription(accessToken, subscriptionId, {
        isEnabled: !isEnabled,
        messageThreadId: messageThreadId ?? null,
      });

      await loadOverview();
      toast.success(!isEnabled ? 'Подписка включена' : 'Подписка выключена', chat.title ?? String(chat.chatId));
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось обновить подписку.';
      setError(nextError);
      toast.error('Не удалось обновить подписку', nextError);
    } finally {
      setSavingSubscriptionId(null);
    }
  }

  async function handleDeleteSubscription(subscriptionId: string) {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm('Удалить эту подписку Telegram-чата?');
    if (!confirmed) {
      return;
    }

    setDeletingSubscriptionId(subscriptionId);
    setError(null);

    try {
      await deleteAdminTelegramSubscription(accessToken, subscriptionId);
      await loadOverview();
      toast.success('Подписка удалена');
    } catch (deleteError) {
      const nextError = deleteError instanceof Error ? deleteError.message : 'Не удалось удалить подписку.';
      setError(nextError);
      toast.error('Не удалось удалить подписку', nextError);
    } finally {
      setDeletingSubscriptionId(null);
    }
  }

  if (!isActive) {
    return null;
  }

  return (
    <div className="page-stack">
      <section className="dashboard-grid admin-stats-grid">
        <article className="glass-card metric-card">
          <p>Чаты</p>
          <strong>{overview?.summary.totalChats ?? 0}</strong>
          <span>Всего Telegram-чатов, которые уже видел бот</span>
        </article>

        <article className="glass-card metric-card">
          <p>Активные</p>
          <strong>{overview?.summary.activeChats ?? 0}</strong>
          <span>Чаты, куда бот может отправлять сообщения</span>
        </article>

        <article className="glass-card metric-card">
          <p>Подписки</p>
          <strong>{overview?.summary.totalSubscriptions ?? 0}</strong>
          <span>Привязки чатов к событиям и уведомлениям</span>
        </article>

        <article className="glass-card metric-card">
          <p>Команды</p>
          <strong>{overview?.summary.recentCommandsCount ?? 0}</strong>
          <span>Последние команды, которые бот обработал</span>
        </article>
      </section>

      <section className="glass-card stack-form">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Telegram</p>
            <h3>Чаты, подписки и команды</h3>
          </div>
          <p className="form-muted">
            Добавьте бота в группу, выполните там <code>/chat_id</code> или <code>/bind_event slug</code>, а здесь уже можно
            увидеть чат, вручную настроить подписки и проверить, какие команды запускались последними.
          </p>
        </div>

        {error ? <p className="form-error">{error}</p> : null}
        {isLoading && !overview ? <p className="form-muted">Загружаем Telegram-раздел...</p> : null}

        <div className="form-grid telegram-admin-form">
          <label>
            <span>Чат</span>
            <select value={selectedChatId} onChange={(event) => setSelectedChatId(event.target.value)}>
              {chatOptions.map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {String(chat.title || chat.username || chat.chatId)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Событие</span>
            <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
              {eventOptions.map((eventItem) => (
                <option key={eventItem.id} value={eventItem.id}>
                  {eventItem.title} ({eventItem.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Тип уведомления</span>
            <select value={selectedType} onChange={(event) => setSelectedType(event.target.value as TelegramChatSubscriptionType)}>
              {subscriptionTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Thread ID / тема</span>
            <input
              value={threadIdInput}
              onChange={(event) => setThreadIdInput(event.target.value)}
              placeholder={selectedChat?.isForum ? 'Например 12' : 'Оставьте пустым для обычного чата'}
            />
          </label>
        </div>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleCreateSubscription()} disabled={isCreating || !selectedChatId || !selectedEventId}>
            {isCreating ? 'Сохраняем...' : 'Добавить подписку'}
          </button>
        </div>

        <div className="role-pills">
          <span className="role-pill">/events</span>
          <span className="role-pill">/event_stats slug</span>
          <span className="role-pill">/event_participants slug</span>
          <span className="role-pill">/event_registrations slug</span>
          <span className="role-pill">/event_export slug</span>
          <span className="role-pill">/bind_event slug</span>
          <span className="role-pill">/subscriptions</span>
        </div>
      </section>

      <section className="user-list">
        {chatOptions.map((chat) => (
          <article key={chat.id} className="user-card telegram-chat-card">
            <div className="user-card-head">
              <div>
                <strong className="user-name">{chat.title || (chat.username ? `@${chat.username}` : String(chat.chatId))}</strong>
                <p className="user-meta">
                  {formatChatKind(chat.kind)} • chat_id {chat.chatId}
                  {chat.username ? ` • @${chat.username}` : ''}
                  {chat.isForum ? ' • forum' : ''}
                </p>
              </div>

              <div className="action-row">
                <span className={`role-pill${chat.isActive ? '' : ' muted-pill'}`}>{chat.isActive ? 'Активен' : 'Выключен'}</span>
                <button
                  type="button"
                  className="secondary-link"
                  onClick={() => void handleToggleChat(chat)}
                  disabled={savingChatId === chat.id}
                >
                  {savingChatId === chat.id ? 'Сохраняем...' : chat.isActive ? 'Выключить чат' : 'Включить чат'}
                </button>
              </div>
            </div>

            <div className="user-info-grid">
              <div>
                <span>Последняя активность</span>
                <strong>{formatDateTime(chat.lastSeenAtUtc)}</strong>
              </div>
              <div>
                <span>Подписок</span>
                <strong>{chat.subscriptions.length}</strong>
              </div>
              <div>
                <span>Создан</span>
                <strong>{formatDateTime(chat.createdAtUtc)}</strong>
              </div>
            </div>

            {chat.subscriptions.length ? (
              <div className="telegram-subscription-list">
                {chat.subscriptions.map((subscription) => (
                  <div key={subscription.id} className="telegram-subscription-row">
                    <div>
                      <strong>{subscription.eventTitle}</strong>
                      <p className="form-muted">
                        {formatSubscriptionType(subscription.subscriptionType)}
                        {subscription.messageThreadId ? ` • тема ${subscription.messageThreadId}` : ''}
                        {subscription.createdByDisplayName ? ` • создал ${subscription.createdByDisplayName}` : ''}
                      </p>
                    </div>

                    <div className="action-row">
                      <span className={`role-pill${subscription.isEnabled ? '' : ' muted-pill'}`}>
                        {subscription.isEnabled ? 'Включена' : 'Выключена'}
                      </span>
                      <button
                        type="button"
                        className="secondary-link"
                        onClick={() => void handleToggleSubscription(chat, subscription.id, subscription.isEnabled, subscription.messageThreadId)}
                        disabled={savingSubscriptionId === subscription.id}
                      >
                        {savingSubscriptionId === subscription.id ? 'Сохраняем...' : subscription.isEnabled ? 'Выключить' : 'Включить'}
                      </button>
                      <button
                        type="button"
                        className="secondary-link danger-link"
                        onClick={() => void handleDeleteSubscription(subscription.id)}
                        disabled={deletingSubscriptionId === subscription.id}
                      >
                        {deletingSubscriptionId === subscription.id ? 'Удаляем...' : 'Удалить'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="form-muted">У этого чата пока нет подписок. Можно добавить их через форму выше или командой /bind_event.</p>
            )}
          </article>
        ))}

        {overview && chatOptions.length === 0 && !isLoading ? (
          <article className="user-card admin-empty-state">
            <strong className="user-name">Telegram-чаты ещё не появились</strong>
            <p className="form-muted">
              Добавьте бота в личный чат или группу и отправьте ему команду <code>/help</code> или <code>/chat_id</code>, после этого чат появится здесь.
            </p>
          </article>
        ) : null}
      </section>

      <section className="glass-card stack-form">
        <div className="section-inline">
          <div>
            <p className="mini-eyebrow">Журнал</p>
            <h3>Последние команды бота</h3>
          </div>
          <p className="form-muted">Здесь видно, кто вызывал команды, в каком чате это происходило и чем ответил бот.</p>
        </div>

        <div className="user-list">
          {(overview?.recentCommands ?? []).map((log) => (
            <article key={log.id} className="user-card">
              <div className="user-card-head">
                <div>
                  <strong className="user-name">/{log.command}</strong>
                  <p className="user-meta">
                    {formatCommandUser(log)}
                    {log.chatTitle ? ` • ${log.chatTitle}` : ''}
                    {log.chatExternalId ? ` • chat_id ${log.chatExternalId}` : ''}
                  </p>
                </div>

                <span className={`role-pill${log.status === 'Handled' ? '' : ' muted-pill'}`}>{log.status}</span>
              </div>

              <div className="user-info-grid">
                <div>
                  <span>Аргументы</span>
                  <strong>{log.arguments || 'Без аргументов'}</strong>
                </div>
                <div>
                  <span>Время</span>
                  <strong>{formatDateTime(log.createdAtUtc)}</strong>
                </div>
              </div>

              {log.responsePreview ? <p className="form-muted">{log.responsePreview}</p> : null}
            </article>
          ))}

          {overview && overview.recentCommands.length === 0 ? (
            <article className="user-card admin-empty-state">
              <strong className="user-name">Команд пока нет</strong>
              <p className="form-muted">Как только администраторы начнут пользоваться командами бота, журнал появится здесь.</p>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
