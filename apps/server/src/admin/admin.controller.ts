import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { calculateWindowStats, type MatchStatRecord, type StatCardPayload } from "@fullfocus/shared";
import { renderStatCard } from "@fullfocus/card-renderer";
import { AuthService } from "./auth.service";
import { AdminGuard, AdminRoles, type AdminSessionUser } from "./admin.guard";
import { PrismaService } from "../prisma.service";

const ALLOWED_BOT_SETTING_KEYS = new Set(["welcomeText", "welcomeImageUrl", "menuButtons", "premiumEmojiCatalog", "donationButton"]);

@Controller("admin")
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Post("auth/telegram")
  async telegramLogin(@Body() body: Record<string, unknown>, @Res({ passthrough: true }) reply: FastifyReply) {
    const session = await this.auth.loginWithTelegram(body as never);
    this.setSessionCookie(reply, session.token);
    return session;
  }

  @Post("auth/dev")
  async devLogin(
    @Body() body: { telegramId?: string; username?: string },
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const session = await this.auth.loginDev(body.telegramId ?? "1", body.username);
    this.setSessionCookie(reply, session.token);
    return session;
  }

  @Post("auth/logout")
  async logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.clearCookie("ff_session", { path: "/" });
    return { ok: true };
  }

  @Get("auth/me")
  @UseGuards(AdminGuard)
  me(@Req() request: FastifyRequest & { adminUser?: AdminSessionUser }) {
    return request.adminUser;
  }

  @Get("overview")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async overview() {
    const [users, admins, maps, lineups, publishedLineups, logs] = await Promise.all([
      this.prisma.botUser.count(),
      this.prisma.adminUser.count(),
      this.prisma.csMap.count({ where: { active: true } }),
      this.prisma.grenadeLineup.count(),
      this.prisma.grenadeLineup.count({ where: { published: true } }),
      this.prisma.playerQueryLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 8
      })
    ]);

    return {
      users,
      admins,
      maps,
      lineups,
      publishedLineups,
      recentQueries: logs.map((log) => ({
        id: log.id,
        query: log.query,
        faceitNickname: log.faceitNickname,
        status: log.status,
        createdAt: log.createdAt.toISOString()
      }))
    };
  }

  @Get("users")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async users() {
    const admins = await this.prisma.adminUser.findMany({ orderBy: { createdAt: "asc" } });
    return admins.map((user) => ({
      ...user,
      role: user.role.toLowerCase(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    }));
  }

  @Patch("users/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("owner")
  async updateUser(@Param("id") id: string, @Body() body: { role?: "owner" | "admin" | "editor" }) {
    const role = body.role?.toUpperCase();
    if (!role || !["OWNER", "ADMIN", "EDITOR"].includes(role)) {
      throw new HttpException("Некорректная роль администратора", HttpStatus.BAD_REQUEST);
    }

    await this.assertOwnerWillRemain(id, role);
    const user = await this.prisma.adminUser.update({
      where: { id },
      data: { role: role as never }
    });
    return this.publicAdmin(user);
  }

  @Delete("users/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("owner")
  async deleteUser(@Param("id") id: string, @Req() request: FastifyRequest & { adminUser?: AdminSessionUser }) {
    if (request.adminUser?.id === id) {
      throw new HttpException("Нельзя удалить собственную учетку администратора", HttpStatus.BAD_REQUEST);
    }
    await this.assertOwnerWillRemain(id, "EDITOR");
    await this.prisma.adminUser.delete({ where: { id } });
    return { ok: true };
  }

  @Get("settings")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async settings() {
    return this.prisma.botSetting.findMany({ orderBy: { key: "asc" } });
  }

  @Patch("settings")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async updateSettings(@Body() body: { settings?: Array<{ key?: string; value?: unknown }> }) {
    const settings = Array.isArray(body.settings) ? body.settings : null;
    if (!settings?.length) {
      throw new HttpException("Нужно передать массив settings", HttpStatus.BAD_REQUEST);
    }

    for (const setting of settings) {
      if (!setting?.key || !ALLOWED_BOT_SETTING_KEYS.has(setting.key)) {
        throw new HttpException(`Настройка ${setting?.key ?? "-"} не поддерживается`, HttpStatus.BAD_REQUEST);
      }
    }

    return this.prisma.$transaction(
      settings.map((setting) =>
        this.prisma.botSetting.upsert({
          where: { key: setting.key as string },
          update: { value: setting.value as never },
          create: { key: setting.key as string, value: setting.value as never }
        })
      )
    );
  }

  @Get("settings/runtime")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  runtimeSettings() {
    return {
      adminPublicUrl: this.config.get<string>("ADMIN_PUBLIC_URL") ?? "",
      botWebhookUrl: this.config.get<string>("BOT_WEBHOOK_URL") ?? "",
      telegramBotUsername: this.config.get<string>("TELEGRAM_BOT_USERNAME") ?? "",
      dockerNginxPort: this.config.get<string>("DOCKER_NGINX_PORT") ?? "18080",
      nodeEnv: this.config.get<string>("NODE_ENV") ?? "development",
      adminDevLogin: this.config.get<string>("ADMIN_DEV_LOGIN") === "true"
    };
  }

  @Patch("settings/:key")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async updateSetting(@Param("key") key: string, @Body() body: { value: unknown }) {
    if (!ALLOWED_BOT_SETTING_KEYS.has(key)) {
      throw new HttpException(`Настройка ${key} не поддерживается`, HttpStatus.BAD_REQUEST);
    }

    return this.prisma.botSetting.upsert({
      where: { key },
      update: { value: body.value as never },
      create: { key, value: body.value as never }
    });
  }

  @Get("cards/preview")
  @Post("cards/preview")
  @UseGuards(AdminGuard)
  @AdminRoles("editor")
  async preview(@Res() reply: FastifyReply) {
    const records: MatchStatRecord[] = Array.from({ length: 30 }, (_, index) => ({
      result: index % 3 === 0 ? "L" : "W",
      kills: 18 + index,
      deaths: 11,
      assists: 5,
      adr: 82 + index,
      headshotsPercent: 46 + (index % 9),
      kd: (18 + index) / 11,
      kr: null,
      elo: 2100 + index * 4
    }));
    const stats = calculateWindowStats(records, 30);
    const payload: StatCardPayload = {
      generatedAt: new Date().toISOString(),
      botName: "FullFocus cs2",
      seasonLabel: `SEASON ${new Date().getFullYear()}`,
      player: {
        playerId: "preview",
        nickname: "SEB0G1",
        avatar: null,
        country: "RU",
        faceitUrl: null,
        steamId64: null,
        elo: 2296,
        skillLevel: 10,
        skillLevelLabel: "10"
      },
      currentWindow: stats,
      previousWindow: null,
      highlights: { bestAdr: 134.3, bestKd: 3.33, maxKills: 41, bestRating: 2.3 },
      topTeammates: [
        { nickname: "Chip063", matches: 12, wins: 8, losses: 4 },
        { nickname: "hasqo__", matches: 9, wins: 6, losses: 3 },
        { nickname: "Princess062", matches: 7, wins: 4, losses: 3 }
      ],
      role: "ENTRY"
    };

    const png = await renderStatCard(payload);
    reply.header("content-type", "image/png");
    return reply.send(png);
  }

  private setSessionCookie(reply: FastifyReply, token: string) {
    reply.setCookie("ff_session", token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: this.config.get<string>("NODE_ENV") === "production",
      maxAge: 7 * 24 * 60 * 60
    });
  }

  private async assertOwnerWillRemain(targetId: string, nextRole: string) {
    const target = await this.prisma.adminUser.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new HttpException("Администратор не найден", HttpStatus.NOT_FOUND);
    }
    if (target.role !== "OWNER" || nextRole === "OWNER") {
      return;
    }

    const ownerCount = await this.prisma.adminUser.count({ where: { role: "OWNER" } });
    if (ownerCount <= 1) {
      throw new HttpException("Нужен хотя бы один владелец панели", HttpStatus.BAD_REQUEST);
    }
  }

  private publicAdmin(user: { id: string; telegramId: string; username: string | null; firstName: string | null; role: unknown; createdAt: Date; updatedAt: Date }) {
    return {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      role: String(user.role).toLowerCase(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }
}
