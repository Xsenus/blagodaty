import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  deleteAdminGalleryAsset,
  getAdminGallery,
  updateAdminGalleryAsset,
  uploadAdminGalleryAssets,
} from '../lib/api';
import { useToast } from '../ui/ToastProvider';
import { PreloadedImage } from '../ui/PreloadedImage';
import type { AdminGalleryAsset, PaginatedResponse } from '../types';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Pagination, SelectBox } from './components/AdminUi';

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
  const [pageSize, setPageSize] = useState(25);
  const [pageData, setPageData] = useState<PaginatedResponse<AdminGalleryAsset> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GalleryAssetDraft>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [savingAssetId, setSavingAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [pendingDeleteAsset, setPendingDeleteAsset] = useState<AdminGalleryAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || !accessToken) {
      return;
    }

    void loadGallery();
  }, [accessToken, isActive, page, pageSize, searchTerm]);

  const pageItems = pageData?.items ?? [];
  const pageSizeOptions = useMemo(() => [10, 25, 50, 100].map((size) => ({ value: size, label: String(size) })), []);

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
      setPendingDeleteAsset(null);
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
    <div className="admin-workspace-stack">
      <div className="admin-compact-heading">
        <div>
          <h2>Медиатека</h2>
          <p>Загрузка, поиск и управление файлами для сайта и мероприятий.</p>
        </div>
        <span className="role-pill">{pageData?.totalItems ?? 0} файлов</span>
      </div>

      <section className="admin-panel gallery-upload-panel">
        <label className="stack-form">
          <span>Выберите файлы</span>
          <input ref={fileInputRef} type="file" multiple />
          <small className="form-muted">
            Поддерживаются изображения, видео и основные документы. Большие файлы удобнее грузить партиями.
          </small>
        </label>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleUpload()} disabled={isUploading}>
            {isUploading ? 'Загружаем…' : 'Загрузить'}
          </button>
        </div>
      </section>

      <form className="admin-data-toolbar" onSubmit={handleSearchSubmit}>
        <label>
          <span>Поиск</span>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Название, описание или имя файла"
          />
        </label>

        <div className="gallery-filter-actions">
          <label>
            <span>Размер страницы</span>
            <SelectBox
              value={pageSize}
              options={pageSizeOptions}
              ariaLabel="Размер страницы"
              onChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </label>

          <button type="submit" className="secondary-button">
            Найти
          </button>
          <button
            type="button"
            className="admin-reset-icon-button"
            aria-label="Сбросить поиск"
            title="Сбросить поиск"
            onClick={() => {
              setSearchInput('');
              setSearchTerm('');
              setPage(1);
            }}
          >
            ↺
          </button>
        </div>
      </form>

      {error ? <ErrorState message={error} /> : null}

      {isLoading ? (
        <LoadingState title="Загружаем медиатеку" description="Проверяем файлы и метаданные." />
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
                      <PreloadedImage src={absoluteUrl} alt={asset.name} loading="lazy" />
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
                      onClick={() => setPendingDeleteAsset(asset)}
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
            <Pagination
              page={pageData.page}
              pageSize={pageData.pageSize}
              totalItems={pageData.totalItems}
              totalPages={pageData.totalPages}
              isLoading={isLoading}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Галерея ещё не заполнена"
          description="Загрузите первые файлы на сервер, чтобы получить прямые ссылки для сайта и мероприятий."
        />
      )}
      <ConfirmDialog
        open={Boolean(pendingDeleteAsset)}
        title="Удалить файл?"
        description={pendingDeleteAsset ? `«${pendingDeleteAsset.name}» будет удален из медиатеки.` : undefined}
        confirmLabel={deletingAssetId ? 'Удаляем…' : 'Удалить'}
        onClose={() => {
          if (!deletingAssetId) {
            setPendingDeleteAsset(null);
          }
        }}
        onConfirm={() => {
          if (pendingDeleteAsset && !deletingAssetId) {
            void handleDelete(pendingDeleteAsset);
          }
        }}
      />
    </div>
  );
}
