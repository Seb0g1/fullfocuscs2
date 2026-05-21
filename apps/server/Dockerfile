FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/card-renderer/package.json packages/card-renderer/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @fullfocus/server prisma:generate
RUN pnpm -r --filter @fullfocus/server... build

FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache fontconfig ttf-dejavu && corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY --from=build /app /app
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @fullfocus/server prisma:deploy && node apps/server/dist/main.js"]
