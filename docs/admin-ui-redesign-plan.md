# План редизайна Blagodaty LK/Admin UI

## 1. Текущая структура frontend

- Монорепа: корень содержит `Blagodaty.sln`, `src/backend/Blagodaty.Api`, `src/frontend/camp-web`, `src/frontend/lk-web`.
- LK frontend: `src/frontend/lk-web`.
- Стек LK: React 19, TypeScript, Vite, React Router, plain CSS. Tailwind и отдельной UI-библиотеки нет.
- Роутинг LK: `src/frontend/lk-web/src/App.tsx`.
- Личный кабинет:
  - `/dashboard` в `DashboardPage`;
  - `/profile` в `ProfilePage`;
  - `/notifications` в `src/frontend/lk-web/src/notifications/NotificationsPage.tsx`;
  - `/camp-registration` в `src/frontend/lk-web/src/camp/CampRegistrationPage.tsx`.
- Админка:
  - новый shell в `src/frontend/lk-web/src/admin/AdminWorkspace.tsx`;
  - shared admin UI в `src/frontend/lk-web/src/admin/components/AdminUi.tsx`;
  - разделы: events, gallery, site settings, telegram, backups в `src/frontend/lk-web/src/admin`.
- API-клиент: `src/frontend/lk-web/src/lib/api.ts`.
- Типы: `src/frontend/lk-web/src/types.ts`.
- Общие стили: `src/frontend/lk-web/src/styles.css`.

## 2. Проблемные места

- Много старых `role-pill`, `status-badge`, больших `glass-card` и длинных форм.
- `select`, `input`, `textarea`, `datetime-local` используются напрямую и выглядят разрозненно.
- Таблицы и списки частично приведены к admin table, но gallery/site/telegram/backups еще используют старые карточки.
- В `App.tsx` остался legacy admin-код, хотя маршруты уже ведут в `AdminWorkspace`.
- Пагинация есть в старом `PaginationBar` и новом admin `Pagination`; нужно привести к единому компоненту.
- Статусы форматируются локальными функциями в нескольких файлах.
- Dashboard/profile/registration/notifications еще выглядят более декоративно, чем рабоче.
- Два уровня навигации могут занимать много места, нужно держать admin sidebar компактным.

## 3. Страницы для редизайна

1. Admin overview.
2. Admin registrations.
3. Admin users.
4. Admin roles.
5. Admin events.
6. Admin gallery.
7. Admin site settings / Google Sheets.
8. Admin Telegram.
9. Admin backups.
10. Admin auth providers.
11. Dashboard личного кабинета.
12. Profile.
13. Camp registration.
14. Notifications.

## 4. Компоненты, которые нужно создать/обновить

- Уже добавлены: `AdminShell`, `AdminSectionHeader`, `StatCard`, `StatusBadge`, `Drawer`, `ConfirmDialog`, `Pagination`, `DataToolbar`, `EmptyState`, `LoadingState`, `ErrorState`, `FormSection`.
- Добавить/доработать:
  - общий `Button`/button CSS variants;
  - `Input`, `Textarea`, `Select` CSS-паттерн;
  - `Switch`;
  - общий `PageHeader`;
  - общий status mapping;
  - `DataTable` или единый table pattern;
  - `FilterBar`;
  - compact cards для mobile;
  - skeleton/loading blocks.

## 5. Порядок выполнения

1. Зафиксировать правила в `AGENTS.md`.
2. Нормализовать CSS tokens в `styles.css`.
3. Улучшить базовые controls: buttons, inputs, selects, textarea, focus, disabled.
4. Доработать admin shell и admin table styles.
5. Привести dashboard/profile/notifications к compact рабочему стилю.
6. Привести camp registration к секционному layout со sticky action zone.
7. Постепенно заменить gallery/site/telegram/backups на shared table/filter/form паттерны.
8. Убрать legacy admin-код из `App.tsx`, когда новая админка стабилизируется.
9. Запустить build/typecheck и проверить основные routes.

## 6. Риски

- В `App.tsx` много логики в одном файле: крупные перемещения могут легко создать регрессию.
- Данные админки требуют auth/admin token; локальная визуальная проверка без сессии ограничена.
- Некоторые интеграции (Google Sheets, Telegram) нельзя дергать ради UI-теста без явного запроса.
- Замена всех native select на полноценный combobox без dependency может занять много времени и повысить риск accessibility-регрессий.
- Старый `package.json` в корне уже изменен вне текущей задачи; его нельзя случайно включать в коммиты.

## 7. Критерии проверки

- `npm run build --prefix src/frontend/lk-web` проходит.
- Если менялись общие frontend-части: `npm run build:web` проходит.
- Если менялся backend: `dotnet build Blagodaty.sln` проходит.
- Protected routes по-прежнему редиректят на login без сессии.
- `/admin`, `/admin/registrations`, `/admin/users`, `/admin/events`, `/dashboard`, `/profile`, `/notifications`, `/camp-registration` компилируются и рендерятся без TypeScript ошибок.
- Нет очевидного desktop horizontal scroll у shell.
- Удаления требуют подтверждение.
- Loading/error/empty states есть у основных списков.
