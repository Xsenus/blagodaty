# Subdomain plan

Для проекта используется такая схема:

## Public hosts

- `camp.blagodaty.ru`
- `camp.blagodaty.online`
- `lk.blagodaty.ru`
- `lk.blagodaty.online`
- `api.blagodaty.ru`
- `api.blagodaty.online`

## Routing

- `camp.*` -> React app `src/frontend/camp-web/dist`
- `lk.*` -> React app `src/frontend/lk-web/dist`
- `/api` на `camp.*` и `lk.*` -> proxy на backend
- `api.*` -> прямой доступ к тому же backend

## Server directories

- `camp.*` -> `/var/www/blagodaty-camp-react`
- `lk.*` -> `/var/www/blagodaty-lk`
- `api` service -> `/opt/blagodaty/api`

## Почему схема удобная

- маркетинговый сайт и кабинет разделены по доменам
- backend остается единым
- можно использовать и `/api` с фронтов, и отдельный `api.*`
- деплой простой: фронты как статика, backend как `systemd`-сервис
