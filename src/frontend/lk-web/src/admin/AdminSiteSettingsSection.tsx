import { useEffect, useState } from 'react';
import { getAdminSiteSettings, updateAdminSiteSettings } from '../lib/api';
import type { AdminSiteSettings, UpdateAdminSiteSettingsRequest } from '../types';
import { useToast } from '../ui/ToastProvider';

type AdminSiteSettingsSectionProps = {
  accessToken: string | null;
  isActive: boolean;
};

type SocialPresetOption = {
  id: string;
  label: string;
  placeholder: string;
};

const presetOptions: SocialPresetOption[] = [
  { id: 'telegram', label: 'Telegram', placeholder: 'https://t.me/blagodaty' },
  { id: 'vk', label: 'VK', placeholder: 'https://vk.com/blagodaty' },
  { id: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@blagodaty' },
  { id: 'rutube', label: 'RuTube', placeholder: 'https://rutube.ru/channel/123456/' },
  { id: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/blagodaty' },
  { id: 'website', label: 'Сайт', placeholder: 'https://blagodaty.ru' },
  { id: 'email', label: 'E-mail', placeholder: 'mailto:hello@blagodaty.ru' },
  { id: 'phone', label: 'Телефон', placeholder: 'tel:+79990000000' },
  { id: 'custom', label: 'Своя ссылка', placeholder: 'https://example.com/profile' },
];

const emptyDraft: UpdateAdminSiteSettingsRequest = {
  socialLinksEnabled: false,
  socialLinksTitle: 'Мы на связи',
  socialLinksDescription: '',
  socialLinks: [],
};

function createEmptyLink(sortOrder = 0): UpdateAdminSiteSettingsRequest['socialLinks'][number] {
  return {
    id: `${Date.now()}-${sortOrder}`,
    preset: 'telegram',
    label: 'Telegram',
    url: '',
    enabled: true,
    showInHeader: true,
    showInFooter: true,
    sortOrder,
  };
}

function getPresetOption(preset: string) {
  return presetOptions.find((item) => item.id === preset) ?? presetOptions[presetOptions.length - 1];
}

function createDraftFromSettings(settings: AdminSiteSettings): UpdateAdminSiteSettingsRequest {
  return {
    socialLinksEnabled: settings.socialLinksEnabled,
    socialLinksTitle: settings.socialLinksTitle ?? 'Мы на связи',
    socialLinksDescription: settings.socialLinksDescription ?? '',
    socialLinks: settings.socialLinks.map((item) => ({
      id: item.id,
      preset: item.preset,
      label: item.label,
      url: item.url,
      enabled: item.enabled,
      showInHeader: item.showInHeader,
      showInFooter: item.showInFooter,
      sortOrder: item.sortOrder,
    })),
  };
}

export function AdminSiteSettingsSection({ accessToken, isActive }: AdminSiteSettingsSectionProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<AdminSiteSettings | null>(null);
  const [draft, setDraft] = useState<UpdateAdminSiteSettingsRequest>(emptyDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !isActive) {
      return;
    }

    void loadSettings();
  }, [accessToken, isActive]);

  async function loadSettings() {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const loaded = await getAdminSiteSettings(accessToken);
      setSettings(loaded);
      setDraft(createDraftFromSettings(loaded));
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить настройки сайта.';
      setError(nextError);
      toast.error('Не удалось открыть настройки сайта', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  function updateDraftLink(index: number, patch: Partial<UpdateAdminSiteSettingsRequest['socialLinks'][number]>) {
    setDraft((current) => ({
      ...current,
      socialLinks: current.socialLinks.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    }));
  }

  function removeLink(index: number) {
    setDraft((current) => ({
      ...current,
      socialLinks: current.socialLinks
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  }

  async function saveSettings() {
    if (!accessToken) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    try {
      const payload: UpdateAdminSiteSettingsRequest = {
        socialLinksEnabled: draft.socialLinksEnabled,
        socialLinksTitle: draft.socialLinksTitle?.trim() || 'Мы на связи',
        socialLinksDescription: draft.socialLinksDescription?.trim() || '',
        socialLinks: draft.socialLinks.map((item, index) => ({
          ...item,
          id: item.id.trim(),
          preset: item.preset.trim(),
          label: item.label.trim() || getPresetOption(item.preset).label,
          url: item.url.trim(),
          sortOrder: item.sortOrder ?? index,
        })),
      };

      const updated = await updateAdminSiteSettings(accessToken, payload);
      setSettings(updated);
      setDraft(createDraftFromSettings(updated));
      setMessage('Настройки сайта сохранены.');
      toast.success('Настройки сайта сохранены');
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить настройки сайта.';
      setError(nextError);
      toast.error('Не удалось сохранить настройки сайта', nextError);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isActive) {
    return null;
  }

  return (
    <section className="glass-card stack-form">
      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Сайт</p>
          <h3>Социальные сети и внешние ссылки</h3>
        </div>
        <p className="form-muted">
          Здесь можно настроить официальные ссылки общины для шапки и подвала публичного сайта.
        </p>
      </div>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {isLoading && !settings ? <p className="form-muted">Загружаем настройки сайта...</p> : null}

      <div className="event-toggle-row">
        <label className="role-toggle">
          <input
            type="checkbox"
            checked={draft.socialLinksEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, socialLinksEnabled: event.target.checked }))}
          />
          <div>
            <strong>Показывать соцсети на сайте</strong>
            <span>Ссылки появятся в шапке и подвале только после включения этого блока.</span>
          </div>
        </label>
      </div>

      <div className="event-editor-grid">
        <label>
          <span>Заголовок блока</span>
          <input
            value={draft.socialLinksTitle ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, socialLinksTitle: event.target.value }))}
          />
        </label>

        <label>
          <span>Описание блока</span>
          <input
            value={draft.socialLinksDescription ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, socialLinksDescription: event.target.value }))}
          />
        </label>
      </div>

      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Ссылки</p>
          <h3>Шапка и подвал</h3>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              socialLinks: [...current.socialLinks, createEmptyLink(current.socialLinks.length)],
            }))
          }
        >
          Добавить ссылку
        </button>
      </div>

      <div className="event-collection">
        {draft.socialLinks.length ? (
          draft.socialLinks.map((item, index) => {
            const presetOption = getPresetOption(item.preset);

            return (
              <article className="event-collection-item" key={item.id}>
                <div className="event-subsection-head compact">
                  <div>
                    <strong>{item.label || presetOption.label}</strong>
                    <p className="form-muted">{presetOption.label}</p>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => removeLink(index)}>
                    Удалить
                  </button>
                </div>

                <div className="event-inline-grid">
                  <label>
                    <span>Тип ссылки</span>
                    <select
                      value={item.preset}
                      onChange={(event) => {
                        const nextPreset = event.target.value;
                        const nextOption = getPresetOption(nextPreset);
                        updateDraftLink(index, {
                          preset: nextPreset,
                          label: item.label === presetOption.label ? nextOption.label : item.label,
                        });
                      }}
                    >
                      {presetOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Подпись</span>
                    <input value={item.label} onChange={(event) => updateDraftLink(index, { label: event.target.value })} />
                  </label>

                  <label>
                    <span>Порядок</span>
                    <input
                      type="number"
                      value={item.sortOrder}
                      onChange={(event) => updateDraftLink(index, { sortOrder: Number(event.target.value) })}
                    />
                  </label>
                </div>

                <label>
                  <span>URL</span>
                  <input
                    value={item.url}
                    onChange={(event) => updateDraftLink(index, { url: event.target.value })}
                    placeholder={presetOption.placeholder}
                    required
                  />
                </label>

                <div className="event-toggle-row">
                  <label className="role-toggle">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) => updateDraftLink(index, { enabled: event.target.checked })}
                    />
                    <div>
                      <strong>Ссылка активна</strong>
                      <span>Неактивные ссылки остаются в настройках, но не выводятся на сайте.</span>
                    </div>
                  </label>

                  <label className="role-toggle">
                    <input
                      type="checkbox"
                      checked={item.showInHeader}
                      onChange={(event) => updateDraftLink(index, { showInHeader: event.target.checked })}
                    />
                    <div>
                      <strong>Показывать в шапке</strong>
                      <span>Подходит для самых важных каналов: Telegram, VK, YouTube.</span>
                    </div>
                  </label>

                  <label className="role-toggle">
                    <input
                      type="checkbox"
                      checked={item.showInFooter}
                      onChange={(event) => updateDraftLink(index, { showInFooter: event.target.checked })}
                    />
                    <div>
                      <strong>Показывать в подвале</strong>
                      <span>Удобно для полного списка контактов и дополнительных ссылок.</span>
                    </div>
                  </label>
                </div>
              </article>
            );
          })
        ) : (
          <article className="event-collection-item">
            <strong>Ссылки пока не добавлены</strong>
            <p className="form-muted">
              Добавьте Telegram, VK, YouTube, сайт общины или любые другие важные каналы, чтобы участникам было проще
              держать связь.
            </p>
          </article>
        )}
      </div>

      <div className="role-pills">
        <span className="role-pill">Всего ссылок: {draft.socialLinks.length}</span>
        <span className="role-pill muted-pill">
          Включено: {draft.socialLinks.filter((item) => item.enabled).length}
        </span>
      </div>

      <div className="action-row">
        <button className="primary-button" type="button" onClick={saveSettings} disabled={isSaving}>
          {isSaving ? 'Сохраняем...' : 'Сохранить настройки сайта'}
        </button>
      </div>
    </section>
  );
}
