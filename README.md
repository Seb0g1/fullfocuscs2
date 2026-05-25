# FullFocus cs2

FullFocus cs2 is a TypeScript monorepo for a Telegram bot, FACEIT CS2 stat cards, grenade lineup catalog, and a modern Russian-first web admin panel.

The production MVP includes a FullFocus grenade video adapter, configurable bot buttons with premium emoji fallbacks, manual banner broadcasts, analytics, and bot user ID import for clean audience management.

## Stack

- `apps/server`: NestJS + Fastify, Telegraf, Prisma, Redis, FACEIT/Steam clients.
- `apps/admin`: Next.js App Router, Tailwind CSS, TanStack Query, Telegram Login.
- `packages/shared`: shared DTOs, constants, input parsing, stat aggregation.
- `packages/card-renderer`: premium SVG-to-PNG stat/comparison cards powered by Resvg.

## Local Setup

```bash
corepack enable
corepack prepare pnpm@10.12.4 --activate
pnpm install
cp .env.example .env
pnpm --filter @fullfocus/server prisma:generate
pnpm --filter @fullfocus/server prisma:migrate
pnpm dev
```

The admin runs on `http://localhost:5030`, and the API/bot server runs on `http://localhost:4000/api`.

## Required Production Env

- `BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `FACEIT_API_KEY`
- `STEAM_API_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `ADMIN_PUBLIC_URL`
- `ADMIN_TELEGRAM_IDS`
- `GRENADE_VIDEO_PRESET`
- `GRENADE_VIDEO_CRF`
- `GRENADE_VIDEO_THREADS`

## Docker

```bash
cp .env.example .env
docker compose up --build
```

For production, put Nginx behind HTTPS and set `BOT_WEBHOOK_URL` to `https://your-domain/api/telegram/webhook`.

Full VPS deployment instructions are in [DEPLOY.md](./DEPLOY.md).

Production domain preset: `https://tiktok.sebog1.ru`. A sanitized env template is available in [.env.tiktok.example](./.env.tiktok.example).

## Verification

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm lint
corepack pnpm smoke:admin
```

`smoke:admin` starts the Next.js admin on `5030` with a mocked API and checks login, dashboard, grenade catalog, users and settings in Chromium. In CI, Chromium is installed with `pnpm exec playwright install --with-deps chromium`.

## Admin Highlights

- `Раскиды`: online 9:16 video editor, source-logo cover, batch MP4 render, editable grenade flight time, media catalog.
- `Настройки`: welcome image upload, bot button constructor, premium emoji IDs with fallback emoji and Telegram-style preview.
- `Рассылки`: banner/photo/video campaigns, test send to admin, manual launch, user ID base import.
- `Аналитика`: active users, FACEIT/API events, popular grenade content, broadcast counters, bot health.
