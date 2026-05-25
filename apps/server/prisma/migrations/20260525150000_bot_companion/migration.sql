ALTER TABLE "CsMap"
  ADD COLUMN "emoji" TEXT,
  ADD COLUMN "premiumEmojiId" TEXT,
  ADD COLUMN "buttonStyle" TEXT NOT NULL DEFAULT 'default';

ALTER TABLE "BotUser"
  ADD COLUMN "boundFaceitPlayerId" TEXT,
  ADD COLUMN "boundFaceitNickname" TEXT,
  ADD COLUMN "boundFaceitElo" INTEGER,
  ADD COLUMN "boundAt" TIMESTAMP(3);

UPDATE "BotUser"
SET
  "boundFaceitPlayerId" = "faceitPlayerId",
  "boundFaceitNickname" = "faceitNickname",
  "boundFaceitElo" = "lastElo",
  "boundAt" = COALESCE("lastSeenAt", "updatedAt", "createdAt")
WHERE "boundFaceitPlayerId" IS NULL
  AND "faceitPlayerId" IS NOT NULL;

CREATE TABLE "BotUserFavoriteLineup" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lineupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BotUserFavoriteLineup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotUserFavoriteLineup_userId_lineupId_key" ON "BotUserFavoriteLineup"("userId", "lineupId");
CREATE INDEX "BotUserFavoriteLineup_lineupId_idx" ON "BotUserFavoriteLineup"("lineupId");

ALTER TABLE "BotUserFavoriteLineup"
  ADD CONSTRAINT "BotUserFavoriteLineup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "BotUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BotUserFavoriteLineup"
  ADD CONSTRAINT "BotUserFavoriteLineup_lineupId_fkey"
  FOREIGN KEY ("lineupId") REFERENCES "GrenadeLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
