# Blagodaty LK UI Redesign Guide

## Цель редизайна

Сделать личный кабинет и админку Blagodaty современной, удобной и спокойной SaaS-панелью для ежедневной работы команды лагеря. Нужно сохранить текущую теплую палитру: светлый кремовый фон, мягкий песочно-оранжевый акцент, темно-синий текст, спокойные зеленые и голубые состояния.

Главные цели:
- повысить плотность полезной информации без ощущения тесноты;
- улучшить таблицы, формы, фильтры, статусы и пагинацию;
- сделать интерфейс единым, предсказуемым и адаптивным;
- не ломать существующую бизнес-логику, auth, роли, API-контракты и интеграции.

## Дизайн-принципы

- Меньше огромных пустых карточек, больше рабочей информации на первом экране.
- Аккуратная сетка, компактные page headers, понятная визуальная иерархия.
- Единые размеры кнопок, инпутов, бейджей, строк таблиц и панелей фильтров.
- Все основные списки имеют loading, error, empty и no-results состояния.
- Не использовать случайные цвета: только токены дизайн-системы.
- Все interactive elements должны иметь hover, focus-visible и disabled states.
- Browser-default `select`, `input`, `textarea`, `date/datetime` нужно стилизовать через общие токены. Searchable combobox делать только там, где список действительно большой.

## Цветовая система

Нормализованные токены должны жить в CSS-переменных:
- `--color-bg`: теплый off-white фон приложения;
- `--color-surface`: белая/почти белая поверхность;
- `--color-surface-muted`: кремовая поверхность для спокойных блоков;
- `--color-primary`: мягкий оранжево-песочный акцент;
- `--color-primary-hover`: чуть насыщеннее для hover;
- `--color-text`: темно-синий основной текст;
- `--color-text-muted`: сине-серый вторичный текст;
- `--color-border`: мягкий бежево-серый border;
- `--color-success-bg`, `--color-success-text`: спокойный зеленый;
- `--color-warning-bg`, `--color-warning-text`: мягкий янтарный;
- `--color-danger-bg`, `--color-danger-text`: приглушенный красный;
- `--color-info-bg`, `--color-info-text`: мягкий голубой.

## Типографика

- Заголовки могут оставаться выразительными, но без чрезмерной драматичности в рабочих панелях.
- Body text должен быть читабельным, таблицы и формы компактнее маркетинговых блоков.
- Единая иерархия: page title, section title, card title, label, helper text.
- В таблицах использовать короткие подписи, `font-size` меньше, но с хорошим контрастом.

## Layout Rules

- На desktop не должно быть горизонтального скролла у основной страницы.
- Таблицы могут иметь внутренний overflow только в своем контейнере, если это оправдано.
- Основной sidebar должен быть компактным и удобным.
- Admin navigation можно делать вторым уровнем, но она должна быть уже, плотнее и без огромных карточек.
- На mobile sidebar превращается в горизонтальную compact navigation или drawer.
- PageHeader: compact overline, title, короткое description, справа ключевой status/action.
- Длинные формы разбивать на секции, drawer или sticky action zone.

## Component Rules

Создавать и переиспользовать:
- `Button`, `IconButton`;
- `Input`, `Textarea`;
- `Select`, `Combobox`;
- `DatePicker`, `DateTimePicker`;
- `Checkbox`, `Radio`, `Switch`;
- `Badge`, `StatusBadge`;
- `Card`, `StatCard`;
- `EmptyState`, `LoadingState`/`Skeleton`, `Alert`;
- `Toast` или inline notification;
- `Tabs`;
- `Modal/Dialog`, `Drawer/SidePanel`;
- `DropdownMenu`;
- `DataTable`;
- `Pagination`;
- `FilterBar`, `SearchInput`;
- `ConfirmDialog`;
- `FormSection`;
- `PageHeader`.

Компоненты должны быть типизированы TypeScript, без тяжелых UI-библиотек без причины и без дублирования разметки.

## Table Rules

- Единый header, padding, row hover и focus.
- Действия в правой колонке; если действий много, использовать компактное меню.
- Статус показывать через `StatusBadge`.
- Даты форматировать единообразно.
- Email, телефон, город и guest id не должны ломать сетку: использовать truncation/wrapping.
- На малой ширине таблица превращается в карточки или имеет локальный overflow-контейнер.
- Пагинация: текущая страница, всего страниц, всего записей, per page, назад/вперед, disabled states.

## Forms Rules

- Label сверху, helper text под полем, ошибки под полем.
- Required поля помечать аккуратно.
- Большие textarea не занимают лишнюю высоту без причины.
- Длинные анкеты разбивать на карточки/секции.
- Основные действия держать внизу секции или sticky action bar.
- Опасные действия отделять визуально.
- Сохранение черновика и отправка заявки должны различаться по визуальной важности.

## Status Rules

Единый маппинг статусов:
- `draft`: Черновик, variant `draft`;
- `submitted`: Отправлено, variant `warning`;
- `pending`: Ждет внимания, variant `warning`;
- `confirmed`: Подтверждено, variant `success`;
- `rejected`: Отклонено, variant `danger`;
- `cancelled`: Отменено, variant `neutral`;
- `waitlist`: Лист ожидания, variant `info`;
- `registration_open`: Регистрация открыта, variant `success`;
- `registration_closed`: Регистрация закрыта, variant `neutral`;
- `unread`: Новое, variant `info`;
- `read`: Прочитано, variant `neutral`;
- `active`: Активно, variant `success`;
- `inactive`: Выключено, variant `neutral`.

Каждый статус должен иметь русский label, semantic variant, цвет и при необходимости короткое описание.

## Accessibility

- Видимый `focus-visible` ring у кнопок, ссылок, полей и интерактивных строк.
- Keyboard navigation для modal/drawer/dropdown; Escape закрывает overlay.
- `aria-label` для icon-only buttons.
- Нормальный контраст текста.
- Не прятать смысл только в цвете: статус всегда текстовый.
- Кнопки внутри форм должны иметь `type="button"`, если это не submit.

## Технические правила

- Использовать текущий стек: React, TypeScript, Vite, plain CSS.
- Не добавлять тяжелые зависимости без крайней необходимости.
- Сначала расширять shared UI components и CSS tokens, затем заменять старые паттерны.
- Не дублировать стили по страницам.
- Не менять API-контракты и backend без необходимости.
- Не запускать live-внешние интеграции в рамках UI-редизайна.
- Не ломать existing build/tests.

## Acceptance Checklist

- [ ] `npm run build --prefix src/frontend/lk-web` проходит.
- [ ] `npm run build:web` проходит, если менялись общие frontend-паттерны.
- [ ] `dotnet build Blagodaty.sln` проходит, если менялся backend.
- [ ] Нет горизонтального скролла на основных desktop pages.
- [ ] Sidebar и admin sidebar выглядят компактно.
- [ ] Таблицы используют единый DataTable/table-паттерн.
- [ ] Пагинация единая.
- [ ] Статусы единые.
- [ ] Формы используют единые поля/секции.
- [ ] Select/calendar/dropdown стилизованы и не выглядят browser-default.
- [ ] Empty/loading/error states оформлены.
- [ ] Основные страницы админки визуально согласованы.
- [ ] Личный кабинет, регистрация и protected routes не сломаны.

## Combobox Rules

- Все select/combobox в админке и личном кабинете должны использовать общий стилизованный паттерн дизайн-системы, а не нативный browser-default вид.
- Для коротких списков показывать понятные значения без лишних слов: например размер страницы `10`, `15`, `25`, `50`, `100`.
- Combobox должен иметь hover, focus-visible, disabled state, закрываться по outside click и Escape.
- Выпадающий список не должен обрезаться внутри таблиц, фильтров и карточек; при необходимости поднимать `z-index` локально.
- В фильтрах таблиц подпись поля остается над контролом, а сам combobox по высоте и радиусу совпадает с обычным input.
