# FullFocus cs2

FullFocus cs2 is a TypeScript monorepo for a Telegram bot, FACEIT CS2 stat cards, grenade lineup catalog, and a modern Russian-first web admin panel.

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

## Docker

```bash
cp .env.example .env
docker compose up --build
```

For production, put Nginx behind HTTPS and set `BOT_WEBHOOK_URL` to `https://your-domain/api/telegram/webhook`.

Full VPS deployment instructions are in [DEPLOY.md](./DEPLOY.md).

Production domain preset: `https://tiktok.sebog1.ru`. A sanitized env template is available in [.env.tiktok.example](./.env.tiktok.example).
