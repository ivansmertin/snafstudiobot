# snafstudio-backend

Отдельный backend-репозиторий для `snafstudio.ru`: FAQ-чат без LLM, авто-создание lead с первого сообщения, inbox для `admin.html`, SQLite-хранилище и опциональные Telegram-уведомления.

## Что делает сервис

- Создает `sessionId` для чат-виджета.
- На первом же сообщении пользователя автоматически создает lead в SQLite и показывает его в admin inbox.
- Не ждет кнопку "Оставить заявку" и не ждет имя/контакт.
- Если пользователь позже отправляет форму контакта, backend обновляет существующий lead по `sessionId`, а не создает новый.
- Отдает короткие детерминированные ответы по `https://snafstudio.ru/data/content.json`.
- Защищает admin API через GitHub allowlist и `httpOnly` cookie.
- Может отправлять уведомления в Telegram, но полностью работает и без Telegram env-переменных.

## Стек

- Node.js 20+
- Express
- SQLite
- better-sqlite3
- cookie-parser
- cors
- dotenv
- CommonJS
- обычный JavaScript без TypeScript

## Структура

```text
.
├─ .env.example
├─ package.json
├─ README.md
└─ src
   ├─ app.js
   ├─ config.js
   ├─ server.js
   ├─ db
   │  └─ index.js
   ├─ middleware
   │  └─ require-admin-auth.js
   ├─ routes
   │  ├─ admin.js
   │  ├─ chat.js
   │  └─ health.js
   ├─ services
   │  ├─ admin-session-service.js
   │  ├─ chat-responder.js
   │  ├─ content-service.js
   │  ├─ github-auth-service.js
   │  ├─ lead-service.js
   │  └─ telegram-service.js
   └─ utils
      ├─ errors.js
      ├─ http.js
      └─ validation.js
```

## Реализованные маршруты

### Chat API

- `POST /api/chat/session`
- `POST /api/chat/message`
- `POST /api/chat/lead`

### Admin API

- `POST /api/admin/auth/github`
- `POST /api/admin/logout`
- `GET /api/admin/inbox?status=new`
- `GET /api/admin/inbox/:id`
- `PATCH /api/admin/inbox/:id`

### Service API

- `GET /api/health`

## Как работает lead flow

1. Фронтенд вызывает `POST /api/chat/session` и получает `sessionId`.
2. На `POST /api/chat/message` backend:
   - детерминированно генерирует reply,
   - сразу создает lead, если это первое сообщение для `sessionId`,
   - сохраняет `firstQuestion`,
   - пишет в `transcript` события `system -> user -> bot`,
   - выставляет статус `new`.
3. Когда пользователь позже вызывает `POST /api/chat/lead`, backend:
   - ищет lead по `sessionId`,
   - обновляет `visitorName`, `contactType`, `contactValue`,
   - при необходимости дополняет `firstQuestion`,
   - не создает дубль благодаря уникальному `session_id` в таблице `leads`.

## Переменные окружения

Скопируйте `.env.example` в `.env`.

| Переменная | Обязательна | Назначение |
|---|---|---|
| `PORT` | нет | Порт сервера |
| `ALLOWED_ORIGINS` | да | Список origin через запятую для CORS |
| `GITHUB_ADMIN_ALLOWLIST` | да | GitHub-логины админов через запятую |
| `TELEGRAM_BOT_TOKEN` | нет | Токен Telegram-бота |
| `TELEGRAM_CHAT_ID` | нет | Чат/канал для уведомлений |
| `SESSION_SECRET` | да | Секрет для подписи admin cookie |
| `CONTENT_SOURCE_URL` | нет | URL публичного JSON контента |
| `SQLITE_PATH` | нет | Путь к SQLite-файлу |
| `ADMIN_APP_URL` | нет | Ссылка на `admin.html`, добавляется в Telegram-сообщение |
| `ADMIN_SESSION_TTL_HOURS` | нет | Время жизни admin cookie |
| `CONTENT_REFRESH_MS` | нет | Интервал обновления `content.json` |
| `COOKIE_SECURE` | да | `true` для HTTPS production |
| `COOKIE_SAME_SITE` | да | `lax`, `strict` или `none` |

## Как установить и запустить локально

```bash
cp .env.example .env
npm install
npm run dev
```

По умолчанию сервер поднимется на `http://localhost:3000`.

Для локальной связки с сайтом:

- добавьте origin сайта и `admin.html` в `ALLOWED_ORIGINS`;
- укажите в фронтенде `chat.apiBaseUrl`, например `http://localhost:3000`;
- если admin работает с другого origin и cookie не проходит, используйте HTTPS и связку `COOKIE_SECURE=true` + `COOKIE_SAME_SITE=none`.

## SQLite-схема

Таблицы:

- `chat_sessions`
- `leads`

`leads.session_id` помечен как `UNIQUE`, поэтому один `sessionId` всегда соответствует одной lead-заявке.

В `transcript` хранится JSON-массив событий:

- сообщения пользователя;
- ответы бота;
- системные события создания lead;
- системные события отправки контактной формы.

## Деплой на VDS

Простой вариант:

1. Скопируйте проект на сервер, например в `/var/www/snafstudio-backend`.
2. Установите Node.js 20+.
3. Создайте `.env`.
4. Выполните `npm install`.
5. Запустите приложение через `pm2` или `systemd`.
6. Проксируйте backend через Nginx на отдельный домен или поддомен, например `https://api.snafstudio.ru`.

### Пример запуска через PM2

```bash
cd /var/www/snafstudio-backend
npm install
pm2 start src/server.js --name snafstudio-backend
pm2 save
pm2 startup
```

### Пример systemd unit

Файл `/etc/systemd/system/snafstudio-backend.service`:

```ini
[Unit]
Description=Snafstudio backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/snafstudio-backend
ExecStart=/usr/bin/node /var/www/snafstudio-backend/src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Команды:

```bash
sudo systemctl daemon-reload
sudo systemctl enable snafstudio-backend
sudo systemctl start snafstudio-backend
sudo systemctl status snafstudio-backend
```

### Пример Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name api.snafstudio.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

После подключения HTTPS выставьте:

```env
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

если `admin.html` и backend работают на разных origin и нужно, чтобы браузер отправлял cookie с `credentials: "include"`.

## Интеграция с текущим сайтом

На сайте уже есть совместимый фронтенд:

- `js/chat-widget.js`
- `js/admin.js`

Что нужно прописать:

1. Указать `chat.apiBaseUrl` в `window.SNAF_CONFIG`, например `https://api.snafstudio.ru`.
2. Добавить origin основного сайта и origin админки в `ALLOWED_ORIGINS`.
3. Заполнить `GITHUB_ADMIN_ALLOWLIST` логином GitHub, которому разрешен вход в inbox.
4. При желании заполнить `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.

## Важные замечания

- Telegram полностью опционален. Если токенов нет, сервис не падает и продолжает сохранять lead.
- GitHub PAT не сохраняется в базе.
- `SESSION_SECRET` обязателен и должен быть длинным случайным значением.
- `/api/health` показывает состояние загрузки `content.json`.
