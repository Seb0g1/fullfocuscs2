FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/card-renderer/package.json packages/card-renderer/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=fullfocuscs2_bot
ARG NEXT_PUBLIC_DEV_LOGIN=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=$NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
ENV NEXT_PUBLIC_DEV_LOGIN=$NEXT_PUBLIC_DEV_LOGIN
RUN pnpm -r --filter @fullfocus/admin... build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY --from=build /app /app
EXPOSE 5030
CMD ["pnpm", "--filter", "@fullfocus/admin", "start"]
