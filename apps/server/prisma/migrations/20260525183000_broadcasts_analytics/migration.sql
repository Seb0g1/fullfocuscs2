CREATE TABLE "BotEvent" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BroadcastCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "buttons" JSONB,
    "targetSegment" TEXT NOT NULL DEFAULT 'all',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BroadcastCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BroadcastDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BotEvent_createdAt_idx" ON "BotEvent"("createdAt");
CREATE INDEX "BotEvent_type_createdAt_idx" ON "BotEvent"("type", "createdAt");
CREATE INDEX "BotEvent_telegramId_createdAt_idx" ON "BotEvent"("telegramId", "createdAt");

CREATE INDEX "BroadcastCampaign_status_createdAt_idx" ON "BroadcastCampaign"("status", "createdAt");
CREATE INDEX "BroadcastCampaign_createdAt_idx" ON "BroadcastCampaign"("createdAt");

CREATE UNIQUE INDEX "BroadcastDelivery_campaignId_telegramId_key" ON "BroadcastDelivery"("campaignId", "telegramId");
CREATE INDEX "BroadcastDelivery_telegramId_idx" ON "BroadcastDelivery"("telegramId");
CREATE INDEX "BroadcastDelivery_status_idx" ON "BroadcastDelivery"("status");

ALTER TABLE "BroadcastDelivery" ADD CONSTRAINT "BroadcastDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BroadcastCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
