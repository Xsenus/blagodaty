import { useEffect, useState } from 'react';
import {
  createAdminBackup,
  downloadAdminBackup,
  getAdminBackups,
  sendAdminBackupToTelegram,
  updateAdminBackupSettings,
} from '../lib/api';
import type {
  AdminDatabaseBackupsOverview,
  UpdateAdminDatabaseBackupSettingsRequest,
} from '../types';
import { useToast } from '../ui/ToastProvider';

type AdminBackupsSectionProps = {
  accessToken: string | null;
  isActive: boolean;
};

const emptyDraft: UpdateAdminDatabaseBackupSettingsRequest = {
  automaticEnabled: false,
  scheduleLocal: '03:00',
  retentionDays: 14,
  telegramDeliveryEnabled: false,
  directory: '',
  pgDumpPath: '',
};

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} Б`;
  }

  const units = ['КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Пока нет';
  }

  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatTriggerLabel(trigger: string) {
  switch (trigger) {
    case 'manual':
      return 'Ручная копия';
    case 'scheduled':
      return 'По расписанию';
    default:
      return trigger;
  }
}

export function AdminBackupsSection({ accessToken, isActive }: AdminBackupsSectionProps) {
  const toast = useToast();
  const [overview, setOverview] = useState<AdminDatabaseBackupsOverview | null>(null);
  const [draft, setDraft] = useState<UpdateAdminDatabaseBackupSettingsRequest>(emptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [sendingPath, setSendingPath] = useState<string | null>(null);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isActive) {
      return;
    }

    void loadOverview();
  }, [accessToken, isActive]);

  function syncDraft(nextOverview: AdminDatabaseBackupsOverview) {
    setDraft({
      automaticEnabled: nextOverview.automaticEnabled,
      scheduleLocal: nextOverview.scheduleLocal || '03:00',
      retentionDays: nextOverview.retentionDays || 14,
      telegramDeliveryEnabled: nextOverview.telegramDeliveryEnabled,
      directory: nextOverview.rootDirectory || '',
      pgDumpPath: nextOverview.pgDumpCommand || '',
    });
  }

  async function loadOverview() {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await getAdminBackups(accessToken);
      setOverview(loaded);
      syncDraft(loaded);
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить резервные копии.';
      setError(nextError);
      toast.error('Не удалось открыть резервные копии', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    if (!accessToken) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateAdminBackupSettings(accessToken, {
        ...draft,
        scheduleLocal: draft.scheduleLocal.trim() || '03:00',
        retentionDays: Math.max(1, draft.retentionDays || 1),
      });

      setOverview(updated);
      syncDraft(updated);
      toast.success('Настройки резервного копирования сохранены');
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить настройки резервного копирования.';
      setError(nextError);
      toast.error('Не удалось сохранить настройки', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  async function createBackup(sendToTelegramAdmins: boolean) {
    if (!accessToken) {
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const created = await createAdminBackup(accessToken, sendToTelegramAdmins);
      await loadOverview();

      const deliveryMessage = created.delivery
        ? `Доставлено ${created.delivery.deliveredCount} из ${created.delivery.candidateRecipients} Telegram-получателей.`
        : 'Файл появился в списке резервных копий и доступен для скачивания.';

      toast.success(
        sendToTelegramAdmins ? 'Резервная копия создана и отправлена' : 'Резервная копия создана',
        deliveryMessage,
      );
    } catch (createError) {
      const nextError = createError instanceof Error ? createError.message : 'Не удалось создать резервную копию.';
      setError(nextError);
      toast.error('Не удалось создать резервную копию', nextError);
    } finally {
      setIsCreating(false);
    }
  }

  async function sendBackup(relativePath?: string) {
    if (!accessToken) {
      return;
    }

    setSendingPath(relativePath ?? '__latest__');
    setError(null);

    try {
      const delivery = await sendAdminBackupToTelegram(accessToken, relativePath);
      toast.success(
        'Резервная копия отправлена',
        `Доставлено ${delivery.deliveredCount} из ${delivery.candidateRecipients} Telegram-получателей.`,
      );
    } catch (sendError) {
      const nextError = sendError instanceof Error ? sendError.message : 'Не удалось отправить резервную копию в Telegram.';
      setError(nextError);
      toast.error('Не удалось отправить резервную копию', nextError);
    } finally {
      setSendingPath(null);
    }
  }

  async function handleDownload(relativePath: string) {
    if (!accessToken) {
      return;
    }

    setDownloadingPath(relativePath);
    setError(null);

    try {
      await downloadAdminBackup(accessToken, relativePath);
    } catch (downloadError) {
      const nextError = downloadError instanceof Error ? downloadError.message : 'Не удалось скачать резервную копию.';
      setError(nextError);
      toast.error('Не удалось скачать резервную копию', nextError);
    } finally {
      setDownloadingPath(null);
    }
  }

  if (!isActive) {
    return null;
  }

  const backups = overview?.items ?? [];
  const canSendToTelegram = (overview?.adminTelegramRecipientsCount ?? 0) > 0;

  return (
    <section className="glass-card stack-form">
      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Резервные копии</p>
          <h3>База данных и Telegram-доставка</h3>
        </div>
        <p className="form-muted">
          Здесь настраиваются автоматические дампы базы, каталог хранения, путь до `pg_dump` и отправка
          готовых файлов администраторам через Telegram-бота.
        </p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="user-info-grid">
        <div>
          <span>Каталог</span>
          <strong>{overview?.rootDirectory || draft.directory || 'Будет определён после сохранения'}</strong>
        </div>
        <div>
          <span>Команда pg_dump</span>
          <strong>{overview?.pgDumpCommand || draft.pgDumpPath || 'Автопоиск на сервере'}</strong>
        </div>
        <div>
          <span>Часовой пояс</span>
          <strong>{overview?.timeZone || 'Локальное время сервера'}</strong>
        </div>
        <div>
          <span>Telegram-администраторы</span>
          <strong>{overview?.adminTelegramRecipientsCount ?? 0}</strong>
        </div>
      </div>

      <div className="form-grid">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.automaticEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, automaticEnabled: event.target.checked }))}
          />
          <span>Включить автоматические резервные копии</span>
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.telegramDeliveryEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, telegramDeliveryEnabled: event.target.checked }))}
          />
          <span>Отправлять свежие дампы администраторам в Telegram</span>
        </label>

        <label>
          <span>Расписание</span>
          <input
            value={draft.scheduleLocal}
            onChange={(event) => setDraft((current) => ({ ...current, scheduleLocal: event.target.value }))}
            placeholder="03:00,15:00"
          />
        </label>

        <label>
          <span>Хранить дней</span>
          <input
            type="number"
            min={1}
            max={365}
            value={draft.retentionDays}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                retentionDays: Number.isFinite(event.target.valueAsNumber)
                  ? event.target.valueAsNumber
                  : current.retentionDays,
              }))
            }
          />
        </label>

        <label>
          <span>Каталог хранения</span>
          <input
            value={draft.directory ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, directory: event.target.value }))}
            placeholder="/root/backups/database"
          />
        </label>

        <label>
          <span>Путь до pg_dump</span>
          <input
            value={draft.pgDumpPath ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, pgDumpPath: event.target.value }))}
            placeholder="/usr/bin/pg_dump"
          />
        </label>
      </div>

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={saveSettings} disabled={isSaving}>
          {isSaving ? 'Сохраняем...' : 'Сохранить настройки'}
        </button>

        <button className="secondary-button" type="button" onClick={() => createBackup(false)} disabled={isCreating}>
          {isCreating ? 'Создаём...' : 'Создать резервную копию'}
        </button>

        <button
          className="primary-button"
          type="button"
          onClick={() => createBackup(true)}
          disabled={isCreating || !canSendToTelegram}
        >
          {isCreating ? 'Создаём...' : 'Создать и отправить в Telegram'}
        </button>
      </div>

      <div className="role-pills">
        <span className="role-pill">Всего файлов: {backups.length}</span>
        <span className="role-pill muted-pill">
          Автокопии: {draft.automaticEnabled ? 'включены' : 'выключены'}
        </span>
        <span className="role-pill muted-pill">
          Telegram-доставка: {draft.telegramDeliveryEnabled ? 'включена' : 'выключена'}
        </span>
      </div>

      {!canSendToTelegram ? (
        <p className="form-muted">
          Чтобы отправлять базу в Telegram, у администратора должен быть привязан Telegram-аккаунт и роль
          администратора в системе.
        </p>
      ) : null}

      {isLoading && !overview ? <p className="form-muted">Загружаем список резервных копий...</p> : null}

      <div className="user-list">
        {backups.map((item) => (
          <article className="user-card" key={item.relativePath}>
            <div className="user-card-head">
              <div>
                <strong className="user-name">{item.fileName}</strong>
                <p className="user-meta">{item.relativePath}</p>
              </div>

              <div className="role-pills">
                <span className={`role-pill ${item.trigger === 'manual' ? '' : 'muted-pill'}`}>
                  {formatTriggerLabel(item.trigger)}
                </span>
              </div>
            </div>

            <div className="user-info-grid">
              <div>
                <span>Размер</span>
                <strong>{formatBytes(item.sizeBytes)}</strong>
              </div>
              <div>
                <span>Создан</span>
                <strong>{formatDateTime(item.createdAtUtc)}</strong>
              </div>
            </div>

            <div className="action-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => handleDownload(item.relativePath)}
                disabled={downloadingPath === item.relativePath}
              >
                {downloadingPath === item.relativePath ? 'Скачиваем...' : 'Скачать'}
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => sendBackup(item.relativePath)}
                disabled={sendingPath === item.relativePath || !canSendToTelegram}
              >
                {sendingPath === item.relativePath ? 'Отправляем...' : 'Отправить в Telegram'}
              </button>
            </div>
          </article>
        ))}

        {overview && backups.length === 0 && !isLoading ? (
          <article className="user-card admin-empty-state">
            <strong className="user-name">Резервных копий пока нет</strong>
            <p className="form-muted">
              Создайте первый дамп вручную или включите автоматическое расписание, чтобы база регулярно
              сохранялась на сервере.
            </p>
          </article>
        ) : null}
      </div>
    </section>
  );
}
