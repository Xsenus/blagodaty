import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';

type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
};

type ToastContextValue = {
  pushToast: (toast: {
    kind?: ToastKind;
    title: string;
    description?: string;
    durationMs?: number;
  }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="toast-layer" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <article className={`toast-card toast-${toast.kind}`} key={toast.id}>
          <div className="toast-content">
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
          </div>

          <button
            className="toast-close"
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </article>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function dismissToast(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function pushToast({
    kind = 'info',
    title,
    description,
    durationMs = 4600,
  }: {
    kind?: ToastKind;
    title: string;
    description?: string;
    durationMs?: number;
  }) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((current) => [
      ...current,
      {
        id,
        kind,
        title,
        description,
      },
    ]);

    window.setTimeout(() => {
      dismissToast(id);
    }, durationMs);
  }

  const value: ToastContextValue = {
    pushToast,
    success: (title, description) => pushToast({ kind: 'success', title, description }),
    error: (title, description) => pushToast({ kind: 'error', title, description }),
    info: (title, description) => pushToast({ kind: 'info', title, description }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }

  return context;
}
