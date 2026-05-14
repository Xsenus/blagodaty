import { useEffect, useState } from 'react';
import {
  getAdminGoogleSheetsSyncSettings,
  getAdminSiteSettings,
  runAdminGoogleSheetsSync,
  updateAdminGoogleSheetsSyncSettings,
  updateAdminSiteSettings,
} from '../lib/api';
import type {
  AdminGoogleSheetsSyncSettings,
  AdminSiteSettings,
  UpdateAdminGoogleSheetsSyncSettingsRequest,
  UpdateAdminSiteSettingsRequest,
} from '../types';
import { useToast } from '../ui/ToastProvider';
import { SelectBox } from './components/AdminUi';

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
  contactsEnabled: true,
  contactsTitle: 'Контакты',
  contactsDescription: 'По организационным вопросам и оплате участия.',
  contactPeople: [],
};

const emptySheetsDraft: UpdateAdminGoogleSheetsSyncSettingsRequest = {
  enabled: false,
  spreadsheetId: '',
  sheetName: 'Registrations',
  serviceAccountJson: '',
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

function createEmptyContactLink(sortOrder = 0): UpdateAdminSiteSettingsRequest['contactPeople'][number]['links'][number] {
  return {
    id: `${Date.now()}-contact-link-${sortOrder}`,
    preset: 'telegram',
    label: 'Telegram',
    url: '',
    sortOrder,
  };
}

function createEmptyContactPerson(sortOrder = 0): UpdateAdminSiteSettingsRequest['contactPeople'][number] {
  return {
    id: `${Date.now()}-contact-${sortOrder}`,
    name: '',
    role: '',
    description: '',
    enabled: true,
    showInFooter: true,
    sortOrder,
    links: [createEmptyContactLink(0)],
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
    contactsEnabled: settings.contactsEnabled,
    contactsTitle: settings.contactsTitle ?? 'Контакты',
    contactsDescription: settings.contactsDescription ?? '',
    contactPeople: settings.contactPeople.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      description: person.description ?? '',
      enabled: person.enabled,
      showInFooter: person.showInFooter,
      sortOrder: person.sortOrder,
      links: person.links.map((link) => ({
        id: link.id,
        preset: link.preset,
        label: link.label,
        url: link.url,
        sortOrder: link.sortOrder,
      })),
    })),
  };
}

function createSheetsDraftFromSettings(
  settings: AdminGoogleSheetsSyncSettings,
): UpdateAdminGoogleSheetsSyncSettingsRequest {
  return {
    enabled: settings.enabled,
    spreadsheetId: settings.spreadsheetId ?? '',
    sheetName: settings.sheetName ?? 'Registrations',
    serviceAccountJson: '',
  };
}

export function AdminSiteSettingsSection({ accessToken, isActive }: AdminSiteSettingsSectionProps) {
  const toast = useToast();
  const [settings, setSettings] = useState<AdminSiteSettings | null>(null);
  const [draft, setDraft] = useState<UpdateAdminSiteSettingsRequest>(emptyDraft);
  const [sheetsSettings, setSheetsSettings] = useState<AdminGoogleSheetsSyncSettings | null>(null);
  const [sheetsDraft, setSheetsDraft] = useState<UpdateAdminGoogleSheetsSyncSettingsRequest>(emptySheetsDraft);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingSheets, setIsSavingSheets] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
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
      const [loaded, loadedSheets] = await Promise.all([
        getAdminSiteSettings(accessToken),
        getAdminGoogleSheetsSyncSettings(accessToken),
      ]);
      setSettings(loaded);
      setDraft(createDraftFromSettings(loaded));
      setSheetsSettings(loadedSheets);
      setSheetsDraft(createSheetsDraftFromSettings(loadedSheets));
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

  function updateContactPerson(index: number, patch: Partial<UpdateAdminSiteSettingsRequest['contactPeople'][number]>) {
    setDraft((current) => ({
      ...current,
      contactPeople: current.contactPeople.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    }));
  }

  function updateContactLink(
    personIndex: number,
    linkIndex: number,
    patch: Partial<UpdateAdminSiteSettingsRequest['contactPeople'][number]['links'][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      contactPeople: current.contactPeople.map((person, currentPersonIndex) =>
        currentPersonIndex === personIndex
          ? {
              ...person,
              links: person.links.map((link, currentLinkIndex) =>
                currentLinkIndex === linkIndex
                  ? {
                      ...link,
                      ...patch,
                    }
                  : link,
              ),
            }
          : person,
      ),
    }));
  }

  function removeContactPerson(index: number) {
    setDraft((current) => ({
      ...current,
      contactPeople: current.contactPeople
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item, itemIndex) => ({ ...item, sortOrder: itemIndex })),
    }));
  }

  function removeContactLink(personIndex: number, linkIndex: number) {
    setDraft((current) => ({
      ...current,
      contactPeople: current.contactPeople.map((person, currentPersonIndex) =>
        currentPersonIndex === personIndex
          ? {
              ...person,
              links: person.links
                .filter((_, currentLinkIndex) => currentLinkIndex !== linkIndex)
                .map((link, nextIndex) => ({ ...link, sortOrder: nextIndex })),
            }
          : person,
      ),
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
        contactsEnabled: draft.contactsEnabled,
        contactsTitle: draft.contactsTitle?.trim() || 'Контакты',
        contactsDescription: draft.contactsDescription?.trim() || '',
        contactPeople: draft.contactPeople.map((person, index) => ({
          ...person,
          id: person.id.trim(),
          name: person.name.trim() || 'Контакт',
          role: person.role?.trim() || 'Ответственный',
          description: person.description?.trim() || '',
          sortOrder: person.sortOrder ?? index,
          links: person.links.map((link, linkIndex) => ({
            ...link,
            id: link.id.trim(),
            preset: link.preset.trim(),
            label: link.label.trim() || getPresetOption(link.preset).label,
            url: link.url.trim(),
            sortOrder: link.sortOrder ?? linkIndex,
          })),
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

  async function saveSheetsSettings() {
    if (!accessToken) {
      return;
    }

    setIsSavingSheets(true);
    setError(null);
    setMessage(null);

    try {
      const payload: UpdateAdminGoogleSheetsSyncSettingsRequest = {
        enabled: sheetsDraft.enabled,
        spreadsheetId: sheetsDraft.spreadsheetId?.trim() || '',
        sheetName: sheetsDraft.sheetName?.trim() || 'Registrations',
        serviceAccountJson: sheetsDraft.serviceAccountJson?.trim() || '',
      };
      const updated = await updateAdminGoogleSheetsSyncSettings(accessToken, payload);
      setSheetsSettings(updated);
      setSheetsDraft(createSheetsDraftFromSettings(updated));
      setMessage('Настройки Google таблицы сохранены.');
      toast.success('Настройки Google таблицы сохранены');
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить настройки Google таблицы.';
      setError(nextError);
      toast.error('Не удалось сохранить настройки Google таблицы', nextError);
    } finally {
      setIsSavingSheets(false);
    }
  }

  async function runSheetsSyncNow() {
    if (!accessToken) {
      return;
    }

    setIsSyncingSheets(true);
    setError(null);
    setMessage(null);

    try {
      const result = await runAdminGoogleSheetsSync(accessToken);
      const loadedSheets = await getAdminGoogleSheetsSyncSettings(accessToken);
      setSheetsSettings(loadedSheets);
      setSheetsDraft(createSheetsDraftFromSettings(loadedSheets));
      if (result.synced) {
        const rows = result.rowsWritten == null ? '' : ` Строк: ${result.rowsWritten}.`;
        setMessage(`${result.message}${rows}`);
        toast.success('Google таблица обновлена', `${result.message}${rows}`);
      } else {
        setError(result.message);
        toast.error('Google таблица не обновлена', result.message);
      }
    } catch (syncError) {
      const nextError = syncError instanceof Error ? syncError.message : 'Не удалось запустить синхронизацию.';
      setError(nextError);
      toast.error('Не удалось запустить синхронизацию', nextError);
    } finally {
      setIsSyncingSheets(false);
    }
  }

  if (!isActive) {
    return null;
  }

  return (
    <div className="admin-workspace-stack">
      <div className="admin-compact-heading">
        <div>
          <h2>Сайт</h2>
          <p>Публичные ссылки, контакты и синхронизация Google Sheets.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => void saveSettings()} disabled={isSaving}>
          {isSaving ? 'Сохраняем...' : 'Сохранить сайт'}
        </button>
      </div>

      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {isLoading && !settings ? <p className="form-muted">Загружаем настройки сайта...</p> : null}

      <section className="admin-panel stack-form">
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

      <section className="admin-panel stack-form">
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
                    <SelectBox
                      value={item.preset}
                      ariaLabel="Тип ссылки"
                      options={presetOptions.map((option) => ({ value: option.id, label: option.label }))}
                      onChange={(nextPreset) => {
                        const nextOption = getPresetOption(nextPreset);
                        updateDraftLink(index, {
                          preset: nextPreset,
                          label: item.label === presetOption.label ? nextOption.label : item.label,
                        });
                      }}
                    />
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
      </section>

      <section className="admin-panel stack-form">
      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Ответственные</p>
          <h3>Контакты для сайта</h3>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            setDraft((current) => ({
              ...current,
              contactPeople: [...current.contactPeople, createEmptyContactPerson(current.contactPeople.length)],
            }))
          }
        >
          Добавить ответственного
        </button>
      </div>

      <div className="event-toggle-row">
        <label className="role-toggle">
          <input
            type="checkbox"
            checked={draft.contactsEnabled}
            onChange={(event) => setDraft((current) => ({ ...current, contactsEnabled: event.target.checked }))}
          />
          <div>
            <strong>Показывать контакты на сайте</strong>
            <span>Можно вести отдельно организационные вопросы, оплату и дополнительные каналы связи.</span>
          </div>
        </label>
      </div>

      <div className="event-editor-grid">
        <label>
          <span>Заголовок контактов</span>
          <input
            value={draft.contactsTitle ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, contactsTitle: event.target.value }))}
          />
        </label>

        <label>
          <span>Описание контактов</span>
          <input
            value={draft.contactsDescription ?? ''}
            onChange={(event) => setDraft((current) => ({ ...current, contactsDescription: event.target.value }))}
          />
        </label>
      </div>

      <div className="event-collection">
        {draft.contactPeople.length ? (
          draft.contactPeople.map((person, personIndex) => (
            <article className="event-collection-item" key={person.id}>
              <div className="event-subsection-head compact">
                <div>
                  <strong>{person.name || 'Новый ответственный'}</strong>
                  <p className="form-muted">{person.role || 'Роль не указана'}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => removeContactPerson(personIndex)}>
                  Удалить
                </button>
              </div>

              <div className="event-inline-grid">
                <label>
                  <span>Имя</span>
                  <input value={person.name} onChange={(event) => updateContactPerson(personIndex, { name: event.target.value })} />
                </label>

                <label>
                  <span>Роль</span>
                  <input value={person.role ?? ''} onChange={(event) => updateContactPerson(personIndex, { role: event.target.value })} />
                </label>

                <label>
                  <span>Порядок</span>
                  <input
                    type="number"
                    value={person.sortOrder}
                    onChange={(event) => updateContactPerson(personIndex, { sortOrder: Number(event.target.value) })}
                  />
                </label>
              </div>

              <label>
                <span>Описание</span>
                <input
                  value={person.description ?? ''}
                  onChange={(event) => updateContactPerson(personIndex, { description: event.target.value })}
                />
              </label>

              <div className="event-toggle-row">
                <label className="role-toggle">
                  <input
                    type="checkbox"
                    checked={person.enabled}
                    onChange={(event) => updateContactPerson(personIndex, { enabled: event.target.checked })}
                  />
                  <div>
                    <strong>Контакт активен</strong>
                    <span>Неактивные ответственные остаются в админке, но не выводятся на сайте.</span>
                  </div>
                </label>

                <label className="role-toggle">
                  <input
                    type="checkbox"
                    checked={person.showInFooter}
                    onChange={(event) => updateContactPerson(personIndex, { showInFooter: event.target.checked })}
                  />
                  <div>
                    <strong>Показывать в подвале</strong>
                    <span>Контакты появятся в нижнем блоке публичной страницы.</span>
                  </div>
                </label>
              </div>

              <div className="section-inline compact-inline">
                <strong>Каналы связи</strong>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    updateContactPerson(personIndex, {
                      links: [...person.links, createEmptyContactLink(person.links.length)],
                    })
                  }
                >
                  Добавить канал
                </button>
              </div>

              <div className="stack-form">
                {person.links.map((link, linkIndex) => {
                  const presetOption = getPresetOption(link.preset);

                  return (
                    <div className="event-subsection" key={link.id}>
                      <div className="event-inline-grid">
                        <label>
                          <span>Тип</span>
                          <SelectBox
                            value={link.preset}
                            ariaLabel="Тип ссылки контакта"
                            options={presetOptions.map((option) => ({ value: option.id, label: option.label }))}
                            onChange={(nextPreset) => {
                              const nextOption = getPresetOption(nextPreset);
                              updateContactLink(personIndex, linkIndex, {
                                preset: nextPreset,
                                label: link.label === presetOption.label ? nextOption.label : link.label,
                              });
                            }}
                          />
                        </label>

                        <label>
                          <span>Подпись</span>
                          <input value={link.label} onChange={(event) => updateContactLink(personIndex, linkIndex, { label: event.target.value })} />
                        </label>

                        <label>
                          <span>Порядок</span>
                          <input
                            type="number"
                            value={link.sortOrder}
                            onChange={(event) => updateContactLink(personIndex, linkIndex, { sortOrder: Number(event.target.value) })}
                          />
                        </label>
                      </div>

                      <label>
                        <span>URL</span>
                        <input
                          value={link.url}
                          onChange={(event) => updateContactLink(personIndex, linkIndex, { url: event.target.value })}
                          placeholder={presetOption.placeholder}
                        />
                      </label>

                      <button className="ghost-button" type="button" onClick={() => removeContactLink(personIndex, linkIndex)}>
                        Удалить канал
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          ))
        ) : (
          <article className="event-collection-item">
            <strong>Ответственные пока не добавлены</strong>
            <p className="form-muted">Добавьте людей и каналы связи: Telegram, телефон, email или любую внешнюю ссылку.</p>
          </article>
        )}
      </div>
      </section>

      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Google Sheets</p>
          <h3>Живая синхронизация заявок</h3>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={runSheetsSyncNow}
          disabled={isSyncingSheets || isSavingSheets}
        >
          {isSyncingSheets ? 'Синхронизируем...' : 'Синхронизировать сейчас'}
        </button>
      </div>

      <div className="event-toggle-row">
        <label className="role-toggle">
          <input
            type="checkbox"
            checked={sheetsDraft.enabled}
            onChange={(event) => setSheetsDraft((current) => ({ ...current, enabled: event.target.checked }))}
          />
          <div>
            <strong>Включить live-sync</strong>
            <span>После отправки заявки или смены статуса сервер обновит Google таблицу.</span>
          </div>
        </label>
      </div>

      <div className="event-editor-grid">
        <label>
          <span>ID таблицы</span>
          <input
            value={sheetsDraft.spreadsheetId ?? ''}
            onChange={(event) => setSheetsDraft((current) => ({ ...current, spreadsheetId: event.target.value }))}
            placeholder="1AbC..."
          />
        </label>

        <label>
          <span>Лист</span>
          <input
            value={sheetsDraft.sheetName ?? ''}
            onChange={(event) => setSheetsDraft((current) => ({ ...current, sheetName: event.target.value }))}
            placeholder="Registrations"
          />
        </label>

        <label>
          <span>Service account</span>
          <input value={sheetsSettings?.serviceAccountEmail ?? (sheetsSettings?.hasServiceAccountJson ? 'Ключ сохранен' : 'Не подключен')} disabled />
        </label>
      </div>

      <label>
        <span>JSON ключ service account</span>
        <textarea
          rows={5}
          value={sheetsDraft.serviceAccountJson ?? ''}
          onChange={(event) => setSheetsDraft((current) => ({ ...current, serviceAccountJson: event.target.value }))}
          placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
        />
      </label>

      <div className="role-pills">
        <span className="role-pill">
          Статус: {sheetsDraft.enabled ? 'включена' : 'выключена'}
        </span>
        {sheetsSettings?.lastSyncedAtUtc ? (
          <span className="role-pill muted-pill">
            Последняя синхронизация: {new Date(sheetsSettings.lastSyncedAtUtc).toLocaleString('ru-RU')}
          </span>
        ) : null}
        {sheetsSettings?.lastError ? <span className="role-pill muted-pill">Ошибка: {sheetsSettings.lastError}</span> : null}
      </div>

      <div className="action-row">
        <button className="secondary-button" type="button" onClick={saveSheetsSettings} disabled={isSavingSheets}>
          {isSavingSheets ? 'Сохраняем...' : 'Сохранить Google Sheets'}
        </button>
      </div>
      </section>
    </div>
  );
}
