import { useEffect, type ReactNode } from 'react';

export type AdminNavItem = {
  to: string;
  label: string;
  description: string;
  group: string;
};

type AdminShellProps = {
  title: string;
  description: string;
  eyebrow?: string;
  accessLabel: string;
  children: ReactNode;
};

export function AdminShell({ title, description, eyebrow, accessLabel, children }: AdminShellProps) {
  return (
    <div className="admin-shell">
      <main className="admin-main">
        <section className="admin-topbar">
          <div>
            <p className="mini-eyebrow">{eyebrow ?? 'Администрирование'}</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <div className="status-badge admin-access-badge">
            <span>Доступ</span>
            <strong>{accessLabel}</strong>
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}

export function AdminSectionHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="admin-section-heading">
      <div>
        {eyebrow ? <p className="mini-eyebrow">{eyebrow}</p> : null}
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="admin-section-actions">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <article className={`admin-stat-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <p>{hint}</p> : null}
    </article>
  );
}

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: string }) {
  return <span className={`admin-status-badge tone-${tone}`}>{label}</span>;
}

export function LoadingState({ title = 'Загружаем данные', description = 'Подождите немного.' }: { title?: string; description?: string }) {
  return (
    <article className="admin-state-card">
      <strong>{title}</strong>
      <p>{description}</p>
    </article>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <article className="admin-state-card">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </article>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <article className="admin-state-card admin-state-error">
      <strong>Что-то пошло не так</strong>
      <p>{message}</p>
    </article>
  );
}

export function DataToolbar({ children }: { children: ReactNode }) {
  return <div className="admin-data-toolbar">{children}</div>;
}

export function Drawer({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="admin-drawer-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        aria-labelledby="admin-drawer-title"
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer-head">
          <div>
            <h3 id="admin-drawer-title">{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" aria-label="Закрыть" onClick={onClose}>
            x
          </button>
        </header>
        <div className="admin-drawer-body">{children}</div>
        {footer ? <footer className="admin-drawer-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <button className="secondary-button" type="button" onClick={onClose}>
            {cancelLabel}
          </button>
          <button className="danger-link" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="form-muted">Действие будет применено сразу после подтверждения.</p>
    </Drawer>
  );
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  isLoading,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((pageNumber) =>
      totalPages <= 7 ||
      pageNumber === 1 ||
      pageNumber === totalPages ||
      Math.abs(pageNumber - page) <= 1,
    );

  return (
    <div className="admin-pagination">
      <span>
        Страница {page} из {Math.max(totalPages, 1)} · {totalItems} записей
      </span>
      <select value={pageSize} disabled={isLoading} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {[10, 20, 50, 100].map((size) => (
          <option value={size} key={size}>
            {size} на странице
          </option>
        ))}
      </select>
      <div>
        <button className="secondary-button" type="button" disabled={isLoading || page <= 1} onClick={() => onPageChange(page - 1)}>
          Назад
        </button>
        <div className="admin-pagination-pages" aria-label="Страницы">
          {pages.map((pageNumber, index) => {
            const previousPage = pages[index - 1];
            const hasGap = previousPage && pageNumber - previousPage > 1;
            return (
              <span key={pageNumber} className="admin-pagination-page-wrap">
                {hasGap ? <span className="admin-pagination-ellipsis">...</span> : null}
                <button
                  className={`admin-pagination-page${pageNumber === page ? ' active' : ''}`}
                  type="button"
                  disabled={isLoading || pageNumber === page}
                  onClick={() => onPageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              </span>
            );
          })}
        </div>
        <button className="secondary-button" type="button" disabled={isLoading || page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Вперед
        </button>
      </div>
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="admin-form-section">
      <div>
        <h4>{title}</h4>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
