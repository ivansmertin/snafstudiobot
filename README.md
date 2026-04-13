# snafstudio-backend

Standalone backend for `snafstudio.ru`: deterministic FAQ chat without LLM, auto-created leads from the first chat message, SQLite inbox for `admin.html`, and optional Telegram notifications.

## Stack

- Node.js 20+
- Express
- SQLite
- better-sqlite3
- cookie-parser
- cors
- dotenv
- CommonJS
- plain JavaScript

## API

### Chat

- `POST /api/chat/session`
- `POST /api/chat/message`
- `POST /api/chat/lead`

### Admin

- `POST /api/admin/auth/github`
- `POST /api/admin/logout`
- `GET /api/admin/inbox?status=new|in_progress|closed|spam|all`
- `GET /api/admin/inbox/:id`
- `PATCH /api/admin/inbox/:id`

### Service

- `GET /api/health`

## Performance Pass

This repo now includes a focused optimization pass with backward-compatible behavior for the existing site frontend.

### Improvements

- `POST /api/chat/message` now works with or without `sessionId`.
- First chat message can create session + lead in one request.
- The response from `POST /api/chat/message` now also includes `sessionId`.
- Lead deduplication stays anchored on unique `session_id`.
- Repeated lead form submits update the same lead instead of creating a new one.
- `GET /api/admin/inbox` now returns compact list items without full `transcript`.
- Full `transcript` is returned only by `GET /api/admin/inbox/:id`.
- GitHub token validation uses a short in-memory cache keyed by token hash.
- Content is loaded into memory and matcher indexes are built only on content refresh.
- External requests use explicit timeouts.
- Request timing logs now print method, path, status code, and duration.

### Compact inbox list payload

`GET /api/admin/inbox` returns:

- `id`
- `createdAt`
- `updatedAt`
- `status`
- `visitorName`
- `contactType`
- `contactValue`
- `firstQuestion`
- `sourcePage`
- `matchType`

`counts` remain unchanged.

### Health endpoint

`GET /api/health` keeps returning:

```json
{
  "ok": true,
  "content": {
    "sourceUrl": "https://snafstudio.ru/data/content.json",
    "lastLoadedAt": "2026-04-13T10:00:00.000Z",
    "lastError": null
  }
}
```

## Lead Flow

1. Frontend may call `POST /api/chat/session` first and receive `sessionId`.
2. Frontend may also skip that step and call `POST /api/chat/message` directly.
3. On the first chat message, backend creates or upserts:
   - chat session
   - lead row with status `new`
   - `firstQuestion`
   - transcript entries for system, user, and bot
4. When `POST /api/chat/lead` is submitted later, backend updates the same lead by `sessionId`.

There is always exactly one lead row per `sessionId`.

## Env

Copy `.env.example` to `.env`.

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no | Server port |
| `ALLOWED_ORIGINS` | yes | Comma-separated CORS origins |
| `GITHUB_ADMIN_ALLOWLIST` | yes | Comma-separated allowed GitHub usernames |
| `TELEGRAM_BOT_TOKEN` | no | Telegram bot token |
| `TELEGRAM_CHAT_ID` | no | Telegram chat or channel id |
| `SESSION_SECRET` | yes | Secret for admin session cookie signing |
| `CONTENT_SOURCE_URL` | no | Source URL for public `content.json` |
| `SQLITE_PATH` | no | SQLite database path |
| `ADMIN_APP_URL` | no | Link to admin app, used in Telegram notification |
| `ADMIN_SESSION_TTL_HOURS` | no | Admin cookie TTL |
| `CONTENT_REFRESH_MS` | no | Content refresh interval |
| `COOKIE_SECURE` | yes | Use `true` on HTTPS production |
| `COOKIE_SAME_SITE` | yes | `lax`, `strict`, or `none` |

## Local Run

```bash
cp .env.example .env
npm install
npm run dev
```

Default local URL:

- `http://localhost:3000`

## Deploy on VDS

Basic flow:

1. Copy the repo to the server, for example `/var/www/snafstudio-backend`.
2. Install Node.js 20+.
3. Create `.env`.
4. Run `npm install`.
5. Start with `pm2` or `systemd`.
6. Put Nginx in front of it, for example on `https://api.snafstudio.ru`.

### PM2 example

```bash
cd /var/www/snafstudio-backend
npm install
pm2 start src/server.js --name snafstudio-backend
pm2 save
pm2 startup
```

### systemd example

File: `/etc/systemd/system/snafstudio-backend.service`

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

Commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable snafstudio-backend
sudo systemctl start snafstudio-backend
sudo systemctl status snafstudio-backend
```

### Nginx reverse proxy example

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

If `admin.html` and backend are on different origins and cookies are sent with `credentials: "include"`, use:

```env
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
```

## Site Integration

The existing site frontend remains compatible.

You need:

1. `window.SNAF_CONFIG.chat.apiBaseUrl = "https://api.snafstudio.ru"`
2. Add both main site origin and admin origin to `ALLOWED_ORIGINS`
3. Add your GitHub login to `GITHUB_ADMIN_ALLOWLIST`
4. Optionally set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`

## Notes

- Telegram is optional. Missing Telegram env vars do not block startup.
- GitHub PAT is never stored in SQLite.
- `SESSION_SECRET` is required and should be long and random.
- `GET /api/health` shows content loader state, including `lastError`.
