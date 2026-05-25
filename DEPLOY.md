# FullFocus cs2 Deployment

This guide deploys FullFocus cs2 to a VPS with Docker Compose.

## 1. Server Requirements

- Ubuntu 22.04/24.04 VPS
- Domain pointed to the server: `tiktok.sebog1.ru`
- Docker Engine and Docker Compose plugin
- Open ports `80` and `443`
- DNS `A` record for `tiktok.sebog1.ru` points to the VPS IP

Install Docker on a fresh Ubuntu server:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

## 2. Clone Project

```bash
git clone https://github.com/Seb0g1/fullfocuscs2.git
cd fullfocuscs2
cp .env.tiktok.example .env
```

## 3. Configure `.env`

Use `tiktok.sebog1.ru` for production:

```bash
BOT_TOKEN=telegram_bot_token
TELEGRAM_BOT_USERNAME=fullfocuscs2_bot
BOT_WEBHOOK_URL=https://tiktok.sebog1.ru/api/telegram/webhook
BOT_WELCOME_IMAGE_URL=

FACEIT_API_KEY=faceit_data_api_key
STEAM_API_KEY=steam_web_api_key

NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://fullfocus:fullfocus@postgres:5432/fullfocus?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=replace-with-long-random-secret
ADMIN_PUBLIC_URL=https://tiktok.sebog1.ru
ADMIN_TELEGRAM_IDS=962443492
ADMIN_DEV_LOGIN=false
MEDIA_ROOT=/app/media
DOCKER_NGINX_PORT=18080
GRENADE_VIDEO_PRESET=superfast
GRENADE_VIDEO_CRF=24
GRENADE_VIDEO_THREADS=0

NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=fullfocuscs2_bot
NEXT_PUBLIC_DEV_LOGIN=false
```

Notes:

- `ADMIN_TELEGRAM_IDS` is a comma-separated allowlist of Telegram user IDs.
- `BOT_WEBHOOK_URL` is applied automatically on server startup.
- Telegram Login requires `tiktok.sebog1.ru` configured for the bot in BotFather via `/setdomain`.
- In BotFather run `/setdomain`, choose `@fullfocuscs2_bot`, and set `tiktok.sebog1.ru` before testing Telegram Login.
- Generate `JWT_SECRET` with `openssl rand -hex 32`.
- Keep `.env` only on the server. Do not commit it.
- `GRENADE_VIDEO_PRESET`, `GRENADE_VIDEO_CRF` and `GRENADE_VIDEO_THREADS` tune ffmpeg speed/quality for the grenade video adapter. The defaults are optimized for fast Telegram MP4 renders.

## 4. Start Stack

If you are already in `~/fullfocuscs2`, do not run `cd fullfocuscs2` again. Check with:

```bash
pwd
ls
```

PostgreSQL and Redis are intentionally not published to host ports. They are available only inside the Docker Compose network as `postgres:5432` and `redis:6379`, so they will not conflict with other projects on the VPS.

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

Run the seed once to create default CS2 maps and welcome settings:

```bash
docker compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
```

The server container runs Prisma migrations on startup.

## 5. HTTPS

The Docker Nginx container listens only on `127.0.0.1:${DOCKER_NGINX_PORT}`. The default is `18080` to avoid common conflicts with other projects. Put host Nginx with Certbot in front of it.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d tiktok.sebog1.ru
```

Use this Nginx server block after Certbot creates the HTTPS config:

```nginx
server {
  listen 80;
  server_name tiktok.sebog1.ru;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name tiktok.sebog1.ru;

  ssl_certificate /etc/letsencrypt/live/tiktok.sebog1.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/tiktok.sebog1.ru/privkey.pem;

  client_max_body_size 64m;

  location / {
    proxy_pass http://127.0.0.1:18080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

If Certbot generated the file automatically, only make sure its `location /` proxies to Docker:

```nginx
location / {
  proxy_pass http://127.0.0.1:18080;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

Reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 6. Smoke Checks

```bash
curl http://127.0.0.1:18080/api/health
curl https://tiktok.sebog1.ru/api/health
docker compose logs -f server
docker compose logs -f admin
```

Open:

- Admin panel: `https://tiktok.sebog1.ru/login`
- API health: `https://tiktok.sebog1.ru/api/health`

In Telegram:

1. Send `/start` to the bot.
2. Open `Статистика` and test a FACEIT nickname.
3. Add a grenade lineup in the admin panel.
4. Open `Раскид гранат` in the bot and verify the published lineup appears.

Admin panel smoke:

1. Open `https://tiktok.sebog1.ru/login`.
2. Log in through Telegram Login.
3. Check dashboard, settings, users, grenade catalog, broadcasts and analytics.
4. In settings, upload welcome image, edit bot button preview and verify `/start` uses the saved settings.
5. In broadcasts, import a small test file with Telegram IDs, create a banner draft and send a test campaign to yourself.

## 7. Updates

```bash
git pull
docker compose down
docker compose up -d --build
docker compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
docker compose ps
docker compose logs -f server
```

The server container runs `prisma migrate deploy` on startup, so the broadcasts/analytics migration is applied automatically before the app starts.

## 8. Troubleshooting

### `unknown shorthand flag: 'd' in -d`

This means Docker Compose v2 is not available. Install the Compose plugin:

```bash
sudo apt update
sudo apt install -y docker-compose-plugin
docker compose version
```

If `docker-compose` v1 is installed instead, either install the v2 plugin above or use the legacy command names:

```bash
git pull
docker-compose down
docker-compose up -d --build
docker-compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
docker-compose logs -f server
```

### `unknown flag: --filter`

This happens when the `docker compose exec ...` command is not being handled by Compose. After installing `docker-compose-plugin`, run:

```bash
docker compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
```

### `address already in use`

If `18080` is also used by another project, change only this value in `.env`:

```bash
DOCKER_NGINX_PORT=18081
```

Then restart the stack and update host Nginx `proxy_pass` to the same port.

### `cd: fullfocuscs2: No such file or directory`

You are probably already inside the project directory. Run:

```bash
pwd
git pull
```

## 9. Backups

Database backup:

```bash
docker compose exec postgres pg_dump -U fullfocus fullfocus > fullfocus-backup.sql
```

Media backup:

```bash
docker run --rm -v fullfocuscs2_media_data:/media -v "$PWD":/backup alpine tar czf /backup/media-backup.tar.gz /media
```
