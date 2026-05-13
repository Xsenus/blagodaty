import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  getAccountNotifications,
  markAccountNotificationAsRead,
  markAllAccountNotificationsAsRead,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import { StatusBadge } from '../ui/status';
import type { AccountNotification, AccountNotificationsResponse, NotificationSeverity } from '../types';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatSeverity(severity: NotificationSeverity) {
  switch (severity) {
    case 'Success':
      return 'Подтверждено';
    case 'Warning':
      return 'Важно';
    default:
      return 'Уведомление';
  }
}

type NotificationRegistrationFocus = 'event' | 'phone' | 'form' | 'summary';

function buildRegistrationLink(eventSlug?: string | null, focus?: NotificationRegistrationFocus | null) {
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

function getNotificationLink(notification: AccountNotification) {
  const directLink = notification.linkUrl?.trim();
  if (directLink) {
    return directLink;
  }

  if (!notification.eventSlug) {
    return null;
  }

  switch (notification.type) {
    case 'RegistrationClosingSoon':
      return buildRegistrationLink(notification.eventSlug, 'form');
    case 'RegistrationSubmitted':
    case 'RegistrationStatusChanged':
      return buildRegistrationLink(notification.eventSlug, 'summary');
    default:
      return buildRegistrationLink(notification.eventSlug);
  }
}

function isExternalUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function getInternalAppHref(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function NotificationsPage() {
  const auth = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [processingNotificationId, setProcessingNotificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AccountNotificationsResponse | null>(null);

  useEffect(() => {
    if (!auth.session) {
      return;
    }

    void loadNotifications();
  }, [auth.session?.accessToken, page, pageSize, unreadOnly]);

  async function loadNotifications() {
    if (!auth.session) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await getAccountNotifications(auth.session.accessToken, {
        page,
        pageSize,
        unreadOnly,
      });

      setResponse(loaded);

      if (auth.account?.unreadNotificationsCount !== loaded.unreadCount) {
        await auth.reloadAccount();
      }
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить уведомления.';
      setError(nextError);
      toast.error('Не удалось открыть уведомления', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  async function markAsRead(notification: AccountNotification) {
    if (!auth.session || notification.isRead) {
      return;
    }

    setProcessingNotificationId(notification.id);
    try {
      await markAccountNotificationAsRead(auth.session.accessToken, notification.id);
      setResponse((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(current.unreadCount - 1, 0),
              items: current.items.map((item) =>
                item.id === notification.id
                  ? {
                      ...item,
                      isRead: true,
                      readAtUtc: new Date().toISOString(),
                    }
                  : item,
              ),
            }
          : current,
      );
      await auth.reloadAccount();
    } catch (markError) {
      const nextError = markError instanceof Error ? markError.message : 'Не удалось отметить уведомление как прочитанное.';
      toast.error('Не удалось обновить уведомление', nextError);
    } finally {
      setProcessingNotificationId(null);
    }
  }

  async function markAllAsRead() {
    if (!auth.session) {
      return;
    }

    setIsMarkingAll(true);
    try {
      const result = await markAllAccountNotificationsAsRead(auth.session.accessToken);
      await loadNotifications();
      await auth.reloadAccount();

      if (result.markedCount > 0) {
        toast.success('Уведомления обновлены', `Отмечено как прочитанное: ${result.markedCount}.`);
      } else {
        toast.info('Все уведомления уже прочитаны', 'Новых действий сейчас не требуется.');
      }
    } catch (markError) {
      const nextError = markError instanceof Error ? markError.message : 'Не удалось отметить все уведомления как прочитанные.';
      toast.error('Не удалось обновить уведомления', nextError);
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <div className="page-stack notifications-page">
      <section className="glass-card stack-form notifications-workspace">
        <div className="notifications-toolbar">
          <div>
            <p className="mini-eyebrow">Журнал</p>
            <h3>История уведомлений</h3>
          </div>

          <div className="action-row">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(event) => {
                  setUnreadOnly(event.target.checked);
                  setPage(1);
                }}
              />
              <span>Показывать только непрочитанные</span>
            </label>

            <button className="secondary-button" type="button" onClick={() => void markAllAsRead()} disabled={isMarkingAll}>
              {isMarkingAll ? 'Обновляем...' : 'Отметить всё как прочитанное'}
            </button>
          </div>
        </div>

        <div className="pagination-bar notifications-pagination">
          <div className="pagination-copy">
            <strong>
              {response?.totalItems ?? 0} записей
            </strong>
            <span>
              Страница {response?.page ?? page} из {response?.totalPages ?? 1}
            </span>
          </div>

          <div className="pagination-actions">
            <label>
              <span>По</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </label>

            <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={page <= 1 || isLoading}>
              Назад
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, response?.totalPages ?? current))}
              disabled={isLoading || page >= (response?.totalPages ?? 1)}
            >
              Далее
            </button>
          </div>
        </div>

        <div className="notifications-table-wrap">
          {isLoading && !response ? (
            <article className="admin-empty-state">
              <strong className="user-name">Загружаем уведомления</strong>
              <p className="form-muted">Собираем для вас все важные статусы и напоминания.</p>
            </article>
          ) : null}

          {response?.items.length ? (
            <table className="notifications-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Событие</th>
                  <th>Уведомление</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {response.items.map((notification) => {
                  const notificationLink = getNotificationLink(notification);
                  const internalNotificationLink = notificationLink ? getInternalAppHref(notificationLink) : null;
                  const hasExternalLink =
                    notificationLink ? !internalNotificationLink && isExternalUrl(notificationLink) : false;

                  return (
                    <tr className={notification.isRead ? 'notification-row-read' : ''} key={notification.id}>
                      <td data-label="Дата">
                        <span className="notification-date">{formatDateTime(notification.createdAtUtc)}</span>
                      </td>
                      <td data-label="Событие">
                        <span className="notification-event">{notification.eventTitle || 'Система'}</span>
                      </td>
                      <td data-label="Уведомление">
                        <strong>{notification.title}</strong>
                        <p>{notification.message}</p>
                      </td>
                      <td data-label="Статус">
                        <StatusBadge
                          status={notification.isRead ? 'read' : 'unread'}
                          label={notification.isRead ? 'Прочитано' : formatSeverity(notification.severity)}
                        />
                      </td>
                      <td data-label="Действия">
                        <div className="notification-row-actions">
                          {!notification.isRead ? (
                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => void markAsRead(notification)}
                              disabled={processingNotificationId === notification.id}
                            >
                              {processingNotificationId === notification.id ? '...' : 'Прочитать'}
                            </button>
                          ) : null}

                          {notificationLink ? (
                            internalNotificationLink ? (
                              <NavLink className="primary-button" to={internalNotificationLink}>
                                Открыть
                              </NavLink>
                            ) : hasExternalLink ? (
                              <a
                                className="primary-button"
                                href={notificationLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Открыть
                              </a>
                            ) : null
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}

          {error ? (
            <article className="admin-empty-state">
              <strong className="user-name">Не удалось загрузить уведомления</strong>
              <p className="form-muted">{error}</p>
            </article>
          ) : null}

          {!isLoading && !error && !response?.items.length ? (
            <article className="admin-empty-state">
              <strong className="user-name">{unreadOnly ? 'Непрочитанных уведомлений нет' : 'Пока уведомлений нет'}</strong>
              <p className="form-muted">
                {unreadOnly
                  ? 'Можно отключить фильтр и посмотреть всю историю уведомлений.'
                  : 'Когда по вашим заявкам появятся обновления или дедлайны, они появятся здесь.'}
              </p>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  );
}
