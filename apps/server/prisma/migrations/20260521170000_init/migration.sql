CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR');
CREATE TYPE "GrenadeSide" AS ENUM ('T', 'CT', 'BOTH');
CREATE TYPE "GrenadeType" AS ENUM ('SMOKE', 'FLASH', 'MOLOTOV', 'HE');
CREATE TYPE "GrenadeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO', 'EXTERNAL');

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "role" "AdminRole" NOT NULL DEFAULT 'EDITOR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CsMap" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CsMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrenadeLineup" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "side" "GrenadeSide" NOT NULL,
  "grenadeType" "GrenadeType" NOT NULL,
  "fromPosition" TEXT NOT NULL,
  "toPosition" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "difficulty" "GrenadeDifficulty" NOT NULL DEFAULT 'EASY',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mediaType" "MediaType" NOT NULL,
  "mediaUrl" TEXT NOT NULL,
  "thumbnailUrl" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrenadeLineup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotUser" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "faceitPlayerId" TEXT,
  "faceitNickname" TEXT,
  "lastElo" INTEGER,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BotUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlayerQueryLog" (
  "id" TEXT NOT NULL,
  "telegramId" TEXT,
  "query" TEXT NOT NULL,
  "faceitPlayerId" TEXT,
  "faceitNickname" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlayerQueryLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BotSetting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BotSetting_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "AdminUser_telegramId_key" ON "AdminUser"("telegramId");
CREATE UNIQUE INDEX "CsMap_slug_key" ON "CsMap"("slug");
CREATE INDEX "GrenadeLineup_mapId_published_idx" ON "GrenadeLineup"("mapId", "published");
CREATE INDEX "GrenadeLineup_grenadeType_side_idx" ON "GrenadeLineup"("grenadeType", "side");
CREATE UNIQUE INDEX "BotUser_telegramId_key" ON "BotUser"("telegramId");
CREATE INDEX "PlayerQueryLog_createdAt_idx" ON "PlayerQueryLog"("createdAt");
CREATE INDEX "PlayerQueryLog_faceitPlayerId_idx" ON "PlayerQueryLog"("faceitPlayerId");

ALTER TABLE "GrenadeLineup" ADD CONSTRAINT "GrenadeLineup_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "CsMap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
