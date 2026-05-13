import type { RegistrationStatus } from '../types';

export type StatusVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'draft';

export type StatusMeta = {
  label: string;
  variant: StatusVariant;
  description?: string;
};

export const statusMap: Record<string, StatusMeta> = {
  draft: { label: 'Черновик', variant: 'draft', description: 'Можно продолжить заполнение.' },
  submitted: { label: 'Отправлено', variant: 'warning', description: 'Ждет внимания команды.' },
  pending: { label: 'Ждет внимания', variant: 'warning' },
  confirmed: { label: 'Подтверждено', variant: 'success', description: 'Участие подтверждено.' },
  rejected: { label: 'Отклонено', variant: 'danger' },
  cancelled: { label: 'Отменено', variant: 'neutral' },
  waitlist: { label: 'Лист ожидания', variant: 'info' },
  registration_open: { label: 'Регистрация открыта', variant: 'success' },
  registration_closed: { label: 'Регистрация закрыта', variant: 'neutral' },
  unread: { label: 'Новое', variant: 'info' },
  read: { label: 'Прочитано', variant: 'neutral' },
  active: { label: 'Активно', variant: 'success' },
  inactive: { label: 'Выключено', variant: 'neutral' },
} satisfies Record<string, StatusMeta>;

export function getRegistrationStatusMeta(status?: RegistrationStatus | null): StatusMeta {
  switch (status) {
    case 'Draft':
      return statusMap.draft;
    case 'Submitted':
      return statusMap.submitted;
    case 'Confirmed':
      return statusMap.confirmed;
    case 'Cancelled':
      return statusMap.cancelled;
    default:
      return { label: 'Без заявки', variant: 'neutral' };
  }
}

export function StatusBadge({
  status,
  label,
  variant,
  title,
}: {
  status?: RegistrationStatus | keyof typeof statusMap | null;
  label?: string;
  variant?: StatusVariant;
  title?: string;
}) {
  const meta = typeof status === 'string' && status in statusMap
    ? statusMap[status as keyof typeof statusMap]
    : getRegistrationStatusMeta(status as RegistrationStatus | null | undefined);

  return (
    <span className={`ui-status-badge tone-${variant ?? meta.variant}`} title={title ?? meta.description}>
      {label ?? meta.label}
    </span>
  );
}
