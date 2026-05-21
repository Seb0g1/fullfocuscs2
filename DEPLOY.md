# FullFocus cs2 Deployment

This guide deploys FullFocus cs2 to a VPS with Docker Compose.

## 1. Server Requirements

- Ubuntu 22.04/24.04 VPS
- Domain pointed to the server, for example `fullfocus.example.com`
- Docker Engine and Docker Compose plugin
- Open ports `80` and `443`

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

Fill these values:

```bash
BOT_TOKEN=telegram_bot_token
TELEGRAM_BOT_USERNAME=FullFocusCs2Bot
BOT_WEBHOOK_URL=https://fullfocus.example.com/api/telegram/webhook
BOT_WELCOME_IMAGE_URL=

FACEIT_API_KEY=faceit_data_api_key
STEAM_API_KEY=steam_web_api_key

DATABASE_URL=postgresql://fullfocus:fullfocus@postgres:5432/fullfocus?schema=public
REDIS_URL=redis://redis:6379
JWT_SECRET=replace-with-long-random-secret
ADMIN_PUBLIC_URL=https://fullfocus.example.com
ADMIN_TELEGRAM_IDS=123456789
ADMIN_DEV_LOGIN=false
MEDIA_ROOT=/app/media

NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=FullFocusCs2Bot
NEXT_PUBLIC_DEV_LOGIN=false
```

Notes:

- `ADMIN_TELEGRAM_IDS` is a comma-separated allowlist of Telegram user IDs.
- `BOT_WEBHOOK_URL` is applied automatically on server startup.
- Telegram Login requires a real HTTPS domain configured for the bot.
- Keep `.env` only on the server. Do not commit it.

## 4. Start Stack

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

The included `nginx/default.conf` is HTTP-only and is meant as a base reverse proxy.

Recommended production options:

- Put the server behind Cloudflare Proxy with SSL enabled.
- Or install Certbot/Nginx on the host and proxy HTTPS traffic to Docker port `80`.
- Or replace the included Nginx container with Caddy/Traefik for automatic TLS.

If using host Nginx with Certbot:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d fullfocus.example.com
```

Then proxy:

```nginx
location / {
  proxy_pass http://127.0.0.1:80;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 6. Smoke Checks

```bash
curl https://fullfocus.example.com/api/health
docker compose logs -f server
docker compose logs -f admin
```

Open:

- Admin panel: `https://fullfocus.example.com/login`
- API health: `https://fullfocus.example.com/api/health`

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

## 8. Backups

Database backup:

```bash
docker compose exec postgres pg_dump -U fullfocus fullfocus > fullfocus-backup.sql
```

Media backup:

```bash
docker run --rm -v fullfocuscs2_media_data:/media -v "$PWD":/backup alpine tar czf /backup/media-backup.tar.gz /media
```
