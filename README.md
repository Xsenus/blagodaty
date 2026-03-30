# Blagodaty

Монорепа проекта поездки церкви на Алтай.

- `camp` — публичный React-сайт с описанием поездки и приглашением
- `lk` — личный кабинет участника с регистрацией, профилем и заявкой
- `api` — `ASP.NET Core 9` + `PostgreSQL` + `JWT` + `Identity`

## Стек

- backend: `C# / ASP.NET Core 9`
- frontend: `React 19 + Vite + TypeScript`
- database: `PostgreSQL`
- production: `nginx + systemd + dotnet + postgresql`

## Структура

```text
src/
  backend/
    Blagodaty.Api/
  frontend/
    camp-web/
    lk-web/
infra/
  deploy/
  subdomains.md
```

## Локальный запуск без Docker

### 1. Подготовить PostgreSQL

Установи локальный PostgreSQL и создай базу с доступом для приложения.

Пример строки подключения:

```text
Host=localhost;Port=5432;Database=blagodaty;Username=postgres;Password=postgres
```

Для PowerShell удобно задать переменную так:

```powershell
$env:ConnectionStrings__Default="Host=localhost;Port=5432;Database=blagodaty;Username=postgres;Password=postgres"
```

### 2. Запустить API

```powershell
dotnet run --project src/backend/Blagodaty.Api/Blagodaty.Api.csproj
```

API сам применяет миграции при старте.

### 3. Запустить camp

```powershell
npm install --prefix src/frontend/camp-web
npm run dev --prefix src/frontend/camp-web
```

### 4. Запустить lk

```powershell
npm install --prefix src/frontend/lk-web
npm run dev --prefix src/frontend/lk-web
```

## Основные endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/account/me`
- `PUT /api/account/profile`
- `GET /api/camp/overview`
- `GET /api/camp/registration`
- `PUT /api/camp/registration`
- `GET /api/camp/registrations` — только для `Admin` и `CampManager`
- `GET /api/admin/overview`
- `PUT /api/admin/users/{userId}/roles`

## Production

Сейчас production работает без Docker:

- `camp.*` отдается из `/var/www/blagodaty-camp-react`
- `lk.*` отдается из `/var/www/blagodaty-lk`
- `api.*` и `/api` проксируются на `ASP.NET Core API`
- API запущен как `systemd`-сервис `blagodaty-api`
- конфиг окружения хранится в `/etc/blagodaty/api.env`

## Автодеплой

В репозитории подготовлен GitHub Actions workflow:

- `.github/workflows/deploy-production.yml`

Он собирает оба фронта и backend, отправляет артефакты на VPS по SSH и запускает серверный deploy-скрипт:

- `infra/deploy/production-deploy.sh`

Настройка секретов и порядок первого подключения описаны в:

- `infra/deploy/github-actions.md`
