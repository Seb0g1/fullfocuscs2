import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminController } from "./admin/admin.controller";
import { AuthService } from "./admin/auth.service";
import { AdminGuard } from "./admin/admin.guard";
import { BotController } from "./bot/bot.controller";
import { BotService } from "./bot/bot.service";
import { FaceitClient } from "./faceit/faceit.client";
import { GrenadesController } from "./grenades/grenades.controller";
import { GrenadesService } from "./grenades/grenades.service";
import { HealthController } from "./health.controller";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";
import { StatsService } from "./stats/stats.service";
import { SteamClient } from "./steam/steam.client";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"]
    })
  ],
  controllers: [AdminController, BotController, GrenadesController, HealthController],
  providers: [
    AdminGuard,
    AuthService,
    BotService,
    FaceitClient,
    GrenadesService,
    PrismaService,
    RedisService,
    StatsService,
    SteamClient
  ]
})
export class AppModule {}
