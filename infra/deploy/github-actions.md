# GitHub Actions production deploy

Репозиторий подготовлен к автодеплою ветки `main` на VPS через GitHub Actions.

## Что делает workflow

Файл:

- `.github/workflows/deploy-production.yml`

Шаги:

1. собирает `camp-web`
2. собирает `lk-web`
3. публикует `Blagodaty.Api`
4. упаковывает артефакты
5. отправляет их на VPS по SSH
6. запускает `infra/deploy/production-deploy.sh`

## GitHub Secrets

В репозитории нужно создать такие secrets:

- `VPS_HOST` — IP или домен VPS
- `VPS_USER` — SSH-пользователь
- `VPS_SSH_PRIVATE_KEY` — приватный ключ для входа по SSH
- `VPS_SSH_PORT` — необязательно, по умолчанию `22`

## Какой пользователь лучше

Самый простой вариант:

- использовать `root`

Более аккуратный вариант:

- отдельный deploy-пользователь с passwordless `sudo` на:
  - `systemctl`
  - `nginx -t`
  - `rsync`
  - запись в `/opt/blagodaty/api`
  - запись в `/var/www/blagodaty-camp-react`
  - запись в `/var/www/blagodaty-lk`

## Что должно уже быть на сервере

- установлен `nginx`
- установлен `dotnet` runtime
- установлен `postgresql`
- создан `systemd`-сервис `blagodaty-api`
- настроен `/etc/blagodaty/api.env`
- настроены `nginx` vhost'ы для `camp.*`, `lk.*`, `api.*`

На текущем VPS это уже есть.
