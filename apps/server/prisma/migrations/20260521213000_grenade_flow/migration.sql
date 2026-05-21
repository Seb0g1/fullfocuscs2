ALTER TABLE "CsMap" ADD COLUMN "overviewImageUrl" TEXT;

ALTER TABLE "GrenadeLineup" ADD COLUMN "area" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GrenadeLineup" ADD COLUMN "areaSlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GrenadeLineup" ADD COLUMN "positionSlug" TEXT NOT NULL DEFAULT '';
ALTER TABLE "GrenadeLineup" ADD COLUMN "mediaItems" JSONB;

CREATE INDEX "GrenadeLineup_mapId_side_areaSlug_idx" ON "GrenadeLineup"("mapId", "side", "areaSlug");
CREATE INDEX "GrenadeLineup_mapId_side_areaSlug_grenadeType_idx" ON "GrenadeLineup"("mapId", "side", "areaSlug", "grenadeType");
