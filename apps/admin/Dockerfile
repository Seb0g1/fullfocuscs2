FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/card-renderer/package.json packages/card-renderer/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm -r --filter @fullfocus/admin... build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@fullfocus/admin", "start"]
