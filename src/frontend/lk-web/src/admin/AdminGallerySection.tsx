import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  deleteAdminGalleryAsset,
  getAdminGallery,
  updateAdminGalleryAsset,
  uploadAdminGalleryAssets,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import type { AdminGalleryAsset, PaginatedResponse } from '../types';

type AdminGallerySectionProps = {
  accessToken: string | null;
  isActive: boolean;
};

type GalleryAssetDraft = {
  name: string;
  description: string;
};

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} Б`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} КБ`;
  }

  if (value < 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} МБ`;
  }

  return `${(value / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toAbsoluteUrl(url: string) {
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export function AdminGallerySection({ accessToken, isActive }: AdminGallerySectionProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [pageData, setPageData] = useState<PaginatedResponse<AdminGalleryAsset> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GalleryAssetDraft>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || !accessToken) {
      return;
    }

    void loadGallery();
  }, [accessToken, isActive, page, pageSize, searchTerm]);

  const pageItems = pageData?.items ?? [];
  const paginationNumbers = useMemo(() => {
    if (!pageData) {
      return [];
    }

    const start = Math.max(1, pageData.page - 2);
    const end = Math.min(pageData.totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }, [pageData]);

  async function loadGallery() {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getAdminGallery(accessToken, {
        page,
        pageSize,
        search: searchTerm,
      });

      setPageData(response);
      setDrafts((current) => ({
        ...current,
        ...Object.fromEntries(
          response.items.map((asset) => [
            asset.id,
            {
              name: asset.name,
              description: asset.description ?? '',
            },
          ]),
        ),
      }));
    } catch (loadError) {
      const nextError = loadError instanceof Error ? loadError.message : 'Не удалось загрузить галерею.';
      setError(nextError);
      toast.error('Не удалось открыть галерею', nextError);
    } finally {
      setIsLoading(false);
    }
  }

  function getDraft(asset: AdminGalleryAsset) {
    return drafts[asset.id] ?? { name: asset.name, description: asset.description ?? '' };
  }

  function updateDraft(assetId: string, patch: Partial<GalleryAssetDraft>) {
    setDrafts((current) => ({
      ...current,
      [assetId]: {
        ...current[assetId],
        ...patch,
      },
    }));
  }

  async function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = searchInput.trim();
    if (page !== 1) {
      setPage(1);
    }
    setSearchTerm(normalized);
  }

  async function handleUpload() {
    if (!accessToken) {
      return;
    }

    const files = Array.from(fileInputRef.current?.files ?? []);
    if (!files.length) {
      toast.info('Файлы не выбраны', 'Добавьте один или несколько файлов перед загрузкой.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await uploadAdminGalleryAssets(accessToken, files);
      const uploadedCount = response.items.length;
      toast.success(
        'Файлы загружены',
        uploadedCount === 1 ? 'Один файл уже доступен в галерее.' : `В галерею добавлено ${uploadedCount} файлов.`,
      );

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (page !== 1) {
        setPage(1);
      } else {
        await loadGallery();
      }
    } catch (uploadError) {
      const nextError = uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить файлы в галерею.';
      setError(nextError);
      toast.error('Загрузка не удалась', nextError);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave(asset: AdminGalleryAsset) {
    if (!accessToken) {
      return;
    }

    setSavingAssetId(asset.id);
    setError(null);

    try {
      const draft = getDraft(asset);
      const updated = await updateAdminGalleryAsset(accessToken, asset.id, {
        name: draft.name,
        description: draft.description,
      });

      setPageData((current) =>
        current
          ? {
              ...current,
              items: current.items.map((item) => (item.id === updated.id ? updated : item)),
            }
          : current,
      );

      setDrafts((current) => ({
        ...current,
        [updated.id]: {
          name: updated.name,
          description: updated.description ?? '',
        },
      }));

      toast.success('Карточка файла сохранена', `Изменения для «${updated.name}» применены.`);
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : 'Не удалось сохранить описание файла.';
      setError(nextError);
      toast.error('Не удалось сохранить файл', nextError);
    } finally {
      setSavingAssetId(null);
    }
  }

  async function handleDelete(asset: AdminGalleryAsset) {
    if (!accessToken) {
      return;
    }

    const confirmed = window.confirm(`Удалить файл «${asset.name}» из галереи?`);
    if (!confirmed) {
      return;
    }

    setDeletingAssetId(asset.id);
    setError(null);

    try {
      await deleteAdminGalleryAsset(accessToken, asset.id);
      toast.success('Файл удалён', `«${asset.name}» больше не отображается в галерее.`);

      const shouldMoveToPreviousPage = (pageData?.items.length ?? 0) === 1 && page > 1;
      if (shouldMoveToPreviousPage) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await loadGallery();
      }
    } catch (deleteError) {
      const nextError = deleteError instanceof Error ? deleteError.message : 'Не удалось удалить файл из галереи.';
      setError(nextError);
      toast.error('Удаление не выполнено', nextError);
    } finally {
      setDeletingAssetId(null);
    }
  }

  async function handleCopy(asset: AdminGalleryAsset) {
    const absoluteUrl = toAbsoluteUrl(asset.url);

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      toast.success('Ссылка скопирована', absoluteUrl);
    } catch {
      toast.info('Не удалось скопировать автоматически', absoluteUrl);
    }
  }

  if (!isActive) {
    return null;
  }

  return (
    <section className="glass-card stack-form">
      <div className="section-inline">
        <div>
          <p className="mini-eyebrow">Галерея</p>
          <h3>Файлы, фото и видео на сервере</h3>
        </div>
        <p className="form-muted">
          Загружайте изображения, видео и документы на сервер, а затем используйте готовые ссылки в карточках событий,
          контентных блоках и на публичном сайте.
        </p>
      </div>

      <div className="gallery-upload-panel">
        <label className="stack-form">
          <span>Выберите файлы</span>
          <input ref={fileInputRef} type="file" multiple />
          <small className="form-muted">
            Поддерживаются изображения, видео и основные документы. Большие файлы удобнее грузить партиями.
          </small>
        </label>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleUpload()} disabled={isUploading}>
            {isUploading ? 'Загружаем…' : 'Загрузить на сервер'}
          </button>
          <a className="secondary-link" href="/admin/events">
            Перейти к мероприятиям
          </a>
        </div>
      </div>

      <form className="admin-filter-bar" onSubmit={handleSearchSubmit}>
        <label>
          <span>Поиск по галерее</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Название, описание или имя файла"
          />
        </label>

        <div className="gallery-filter-actions">
          <label>
            <span>На странице</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={48}>48</option>
            </select>
          </label>

          <button type="submit" className="secondary-link">
            Обновить
          </button>
        </div>
      </form>

      {error ? <p className="form-error">{error}</p> : null}

      {isLoading ? (
        <p className="form-muted">Загружаем файлы галереи…</p>
      ) : pageItems.length ? (
        <>
          <div className="gallery-grid">
            {pageItems.map((asset) => {
              const draft = getDraft(asset);
              const absoluteUrl = toAbsoluteUrl(asset.url);

              return (
                <article className="gallery-card" key={asset.id}>
                  <div className="gallery-preview">
                    {asset.kind === 'Image' ? (
                      <img src={absoluteUrl} alt={asset.name} loading="lazy" />
                    ) : asset.kind === 'Video' ? (
                      <video controls preload="metadata">
                        <source src={absoluteUrl} type={asset.contentType} />
                      </video>
                    ) : (
                      <div className="gallery-file-placeholder">
                        <strong>{asset.fileExtension.replace('.', '').toUpperCase()}</strong>
                        <span>Файл</span>
                      </div>
                    )}
                  </div>

                  <div className="gallery-card-head">
                    <div>
                      <h3>{asset.name}</h3>
                      <p className="form-muted">{asset.originalFileName}</p>
                    </div>
                    <span className={`role-pill${asset.existsOnDisk ? '' : ' muted-pill'}`}>
                      {asset.existsOnDisk ? asset.kind : 'Нет на диске'}
                    </span>
                  </div>

                  <div className="user-info-grid gallery-meta-grid">
                    <div>
                      <span>Размер</span>
                      <strong>{formatBytes(asset.fileSizeBytes)}</strong>
                    </div>
                    <div>
                      <span>Создан</span>
                      <strong>{formatDateTime(asset.createdAtUtc)}</strong>
                    </div>
                    <div>
                      <span>Обновлён</span>
                      <strong>{formatDateTime(asset.updatedAtUtc)}</strong>
                    </div>
                    <div>
                      <span>Путь</span>
                      <strong>{asset.diskPath}</strong>
                    </div>
                  </div>

                  <div className="form-grid single-column">
                    <label>
                      <span>Название</span>
                      <input
                        value={draft.name}
                        onChange={(event) => updateDraft(asset.id, { name: event.target.value })}
                        placeholder="Название файла"
                      />
                    </label>

                    <label>
                      <span>Описание</span>
                      <textarea
                        rows={3}
                        value={draft.description}
                        onChange={(event) => updateDraft(asset.id, { description: event.target.value })}
                        placeholder="Короткая заметка для админки"
                      />
                    </label>

                    <label>
                      <span>Публичная ссылка</span>
                      <input value={absoluteUrl} readOnly />
                    </label>
                  </div>

                  <div className="action-row">
                    <button
                      type="button"
                      className="secondary-link"
                      onClick={() => void handleCopy(asset)}
                    >
                      Копировать ссылку
                    </button>
                    <a className="secondary-link" href={absoluteUrl} target="_blank" rel="noreferrer">
                      Открыть файл
                    </a>
                    <button
                      type="button"
                      className="secondary-link"
                      onClick={() => void handleSave(asset)}
                      disabled={savingAssetId === asset.id}
                    >
                      {savingAssetId === asset.id ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="secondary-link danger-link"
                      onClick={() => void handleDelete(asset)}
                      disabled={deletingAssetId === asset.id}
                    >
                      {deletingAssetId === asset.id ? 'Удаляем…' : 'Удалить'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {pageData ? (
            <div className="pagination-bar">
              <div className="pagination-summary">
                <span>Всего файлов</span>
                <strong>{pageData.totalItems}</strong>
              </div>

              <div className="pagination-actions">
                <button
                  type="button"
                  className="pagination-page"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pageData.page <= 1}
                >
                  Назад
                </button>

                <div className="pagination-pages">
                  {paginationNumbers.map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={`pagination-page${pageData.page === pageNumber ? ' active' : ''}`}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="pagination-page"
                  onClick={() => setPage((current) => Math.min(pageData.totalPages, current + 1))}
                  disabled={pageData.page >= pageData.totalPages}
                >
                  Дальше
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="glass-card admin-empty-state">
          <p className="mini-eyebrow">Пока пусто</p>
          <h3>Галерея ещё не заполнена</h3>
          <p className="form-muted">Загрузите первые файлы на сервер, чтобы получить прямые ссылки для сайта и мероприятий.</p>
        </div>
      )}
    </section>
  );
}
