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
cp .env.example .env
```

## 3. Configure `.env`

For this project, use `tiktok.sebog1.ru`:

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

NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=fullfocuscs2_bot
NEXT_PUBLIC_DEV_LOGIN=false
```

Notes:

- `ADMIN_TELEGRAM_IDS` is a comma-separated allowlist of Telegram user IDs.
- `BOT_WEBHOOK_URL` is applied automatically on server startup.
- Telegram Login requires `tiktok.sebog1.ru` configured for the bot in BotFather via `/setdomain`.
- Generate `JWT_SECRET` with `openssl rand -hex 32`.
- Keep `.env` only on the server. Do not commit it.

## 4. Start Stack

If you are already in `~/fullfocuscs2`, do not run `cd fullfocuscs2` again. Check with:

```bash
pwd
ls
```

```bash
docker compose up -d --build
docker compose ps
```

Run the seed once to create default CS2 maps and welcome settings:

```bash
docker compose exec server corepack pnpm --filter @fullfocus/server prisma:seed
```

The server container runs Prisma migrations on startup.

## 5. HTTPS

The Docker Nginx container listens only on `127.0.0.1:8080`. Put host Nginx with Certbot in front of it.

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
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

If Certbot generated the file automatically, only make sure its `location /` proxies to Docker:

```nginx
location / {
  proxy_pass http://127.0.0.1:8080;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 6. Smoke Checks

```bash
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

## 7. Updates

```bash
git pull
docker compose up -d --build
docker compose exec server corepack pnpm --filter @fullfocus/server prisma:seed
docker compose logs -f server
```

## 9. Troubleshooting

### `unknown shorthand flag: 'd' in -d`

This means Docker Compose v2 is not available. Install the Compose plugin:

```bash
sudo apt update
sudo apt install -y docker-compose-plugin
docker compose version
```

If `docker-compose` v1 is installed instead, either install the v2 plugin above or use the legacy command names:

```bash
docker-compose up -d --build
docker-compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
docker-compose logs -f server
```

### `unknown flag: --filter`

This happens when the `docker compose exec ...` command is not being handled by Compose. After installing `docker-compose-plugin`, run:

```bash
docker compose exec server sh -lc 'corepack pnpm --filter @fullfocus/server prisma:seed'
```

### `cd: fullfocuscs2: No such file or directory`

You are probably already inside the project directory. Run:

```bash
pwd
git pull
```

## 8. Backups

Database backup:

```bash
docker compose exec postgres pg_dump -U fullfocus fullfocus > fullfocus-backup.sql
```

Media backup:

```bash
docker run --rm -v fullfocuscs2_media_data:/media -v "$PWD":/backup alpine tar czf /backup/media-backup.tar.gz /media
```
