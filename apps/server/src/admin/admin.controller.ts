import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { calculateWindowStats, type MatchStatRecord, type StatCardPayload } from "@fullfocus/shared";
import { renderStatCard } from "@fullfocus/card-renderer";
import { AuthService } from "./auth.service";
import { AdminGuard, AdminRoles, type AdminSessionUser } from "./admin.guard";
import { PrismaService } from "../prisma.service";

const ALLOWED_BOT_SETTING_KEYS = new Set(["welcomeText", "welcomeImageUrl", "menuButtons", "botButtons", "premiumEmojiCatalog", "donationButton"]);

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

  @Get("broadcasts")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async broadcasts() {
    const campaigns = await this.prisma.broadcastCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 50
    });
    return campaigns.map((campaign) => this.publicCampaign(campaign));
  }

  @Post("broadcasts")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async createBroadcast(@Body() body: BroadcastInput, @Req() request: FastifyRequest & { adminUser?: AdminSessionUser }) {
    const campaign = await this.prisma.broadcastCampaign.create({
      data: {
        title: normalizeRequiredString(body.title, "Название рассылки обязательно"),
        caption: normalizeString(body.caption),
        mediaType: normalizeString(body.mediaType) || null,
        mediaUrl: normalizeString(body.mediaUrl) || null,
        buttons: normalizeButtons(body.buttons) as never,
        targetSegment: normalizeSegment(body.targetSegment),
        status: "draft",
        createdBy: request.adminUser?.telegramId
      }
    });
    return this.publicCampaign(campaign);
  }

  @Patch("broadcasts/:id")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async updateBroadcast(@Param("id") id: string, @Body() body: Partial<BroadcastInput>) {
    const campaign = await this.prisma.broadcastCampaign.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: normalizeRequiredString(body.title, "Название рассылки обязательно") } : {}),
        ...(body.caption !== undefined ? { caption: normalizeString(body.caption) } : {}),
        ...(body.mediaType !== undefined ? { mediaType: normalizeString(body.mediaType) || null } : {}),
        ...(body.mediaUrl !== undefined ? { mediaUrl: normalizeString(body.mediaUrl) || null } : {}),
        ...(body.buttons !== undefined ? { buttons: normalizeButtons(body.buttons) as never } : {}),
        ...(body.targetSegment !== undefined ? { targetSegment: normalizeSegment(body.targetSegment) } : {})
      }
    });
    return this.publicCampaign(campaign);
  }

  @Post("broadcasts/:id/test")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async testBroadcast(@Param("id") id: string, @Req() request: FastifyRequest & { adminUser?: AdminSessionUser }) {
    const telegramId = request.adminUser?.telegramId;
    if (!telegramId) {
      throw new HttpException("Не удалось определить Telegram ID администратора", HttpStatus.BAD_REQUEST);
    }
    const campaign = await this.prisma.broadcastCampaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new HttpException("Рассылка не найдена", HttpStatus.NOT_FOUND);
    }
    await this.sendBroadcastMessage(telegramId, campaign);
    await this.trackEvent("broadcast_test", telegramId, { campaignId: id });
    return { ok: true };
  }

  @Post("broadcasts/:id/send")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async sendBroadcast(@Param("id") id: string) {
    const campaign = await this.prisma.broadcastCampaign.update({
      where: { id },
      data: { status: "sending", sentAt: new Date(), sentCount: 0, failedCount: 0, totalCount: 0 }
    });
    void this.runBroadcast(campaign.id);
    return this.publicCampaign(campaign);
  }

  @Post("broadcasts/:id/cancel")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async cancelBroadcast(@Param("id") id: string) {
    const campaign = await this.prisma.broadcastCampaign.update({
      where: { id },
      data: { status: "cancelled" }
    });
    return this.publicCampaign(campaign);
  }

  @Post("broadcasts/import-users")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async importBroadcastUsers(@Req() request: FastifyRequest) {
    const file = await (request as never as { file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }> }).file();
    const text = (await file.toBuffer()).toString("utf8");
    const ids = Array.from(new Set(text.match(/\b\d{5,20}\b/g) ?? []));
    if (!ids.length) {
      throw new HttpException("В файле не найдено Telegram ID", HttpStatus.BAD_REQUEST);
    }
    await this.prisma.$transaction(
      ids.map((telegramId) =>
        this.prisma.botUser.upsert({
          where: { telegramId },
          update: { lastSeenAt: new Date() },
          create: { telegramId }
        })
      )
    );
    return { imported: ids.length };
  }

  @Get("analytics/overview")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async analyticsOverview(@Query("range") range = "7d") {
    const from = rangeStart(range);
    const [users, activeUsers, events, statsSuccess, statsError, lineupsSent, broadcasts] = await Promise.all([
      this.prisma.botUser.count(),
      this.prisma.botUser.count({ where: { lastSeenAt: { gte: from } } }),
      this.prisma.botEvent.count({ where: { createdAt: { gte: from } } }),
      this.prisma.botEvent.count({ where: { type: "stats_success", createdAt: { gte: from } } }),
      this.prisma.botEvent.count({ where: { type: "stats_error", createdAt: { gte: from } } }),
      this.prisma.botEvent.count({ where: { type: "lineup_sent", createdAt: { gte: from } } }),
      this.prisma.broadcastCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 6 })
    ]);
    return {
      range,
      users,
      activeUsers,
      events,
      statsSuccess,
      statsError,
      lineupsSent,
      broadcasts: broadcasts.map((campaign) => this.publicCampaign(campaign))
    };
  }

  @Get("analytics/content")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async analyticsContent(@Query("range") range = "7d") {
    const from = rangeStart(range);
    const [maps, grenadeTypes, searches] = await Promise.all([
      this.groupEventMetadata("lineup_sent", "mapSlug", from),
      this.groupEventMetadata("lineup_sent", "grenadeType", from),
      this.prisma.botEvent.findMany({ where: { type: "search", createdAt: { gte: from } }, orderBy: { createdAt: "desc" }, take: 20 })
    ]);
    return {
      range,
      maps,
      grenadeTypes,
      searches: searches.map((event) => ({ id: event.id, createdAt: event.createdAt.toISOString(), metadata: event.metadata }))
    };
  }

  @Get("analytics/broadcasts")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async analyticsBroadcasts() {
    const campaigns = await this.prisma.broadcastCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    return campaigns.map((campaign) => this.publicCampaign(campaign));
  }

  @Get("health")
  @UseGuards(AdminGuard)
  @AdminRoles("admin")
  async adminHealth() {
    const [users, mediaCount, lastErrors] = await Promise.all([
      this.prisma.botUser.count(),
      this.prisma.grenadeLineup.count(),
      this.prisma.botEvent.findMany({
        where: { type: { in: ["stats_error", "broadcast_error", "render_error"] } },
        orderBy: { createdAt: "desc" },
        take: 8
      })
    ]);
    return {
      ok: true,
      users,
      lineups: mediaCount,
      webhookUrl: this.config.get<string>("BOT_WEBHOOK_URL") ?? "",
      adminPublicUrl: this.config.get<string>("ADMIN_PUBLIC_URL") ?? "",
      ffmpeg: "configured",
      lastErrors: lastErrors.map((event) => ({ id: event.id, type: event.type, metadata: event.metadata, createdAt: event.createdAt.toISOString() }))
    };
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

  private async runBroadcast(campaignId: string) {
    const campaign = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== "sending") return;
    const users = await this.selectBroadcastUsers(campaign.targetSegment);
    await this.prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { totalCount: users.length } });

    let sentCount = 0;
    let failedCount = 0;
    for (const user of users) {
      const fresh = await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (fresh?.status === "cancelled") break;
      try {
        await this.sendBroadcastMessage(user.telegramId, campaign);
        sentCount += 1;
        await this.prisma.broadcastDelivery.upsert({
          where: { campaignId_telegramId: { campaignId, telegramId: user.telegramId } },
          update: { status: "sent", error: null, sentAt: new Date() },
          create: { campaignId, telegramId: user.telegramId, status: "sent", sentAt: new Date() }
        });
        await this.trackEvent("broadcast_sent", user.telegramId, { campaignId });
      } catch (error) {
        failedCount += 1;
        await this.prisma.broadcastDelivery.upsert({
          where: { campaignId_telegramId: { campaignId, telegramId: user.telegramId } },
          update: { status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "send failed" },
          create: { campaignId, telegramId: user.telegramId, status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "send failed" }
        });
        await this.trackEvent("broadcast_error", user.telegramId, { campaignId, error: error instanceof Error ? error.message : "send failed" });
      }
      if ((sentCount + failedCount) % 10 === 0) {
        await this.prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { sentCount, failedCount } });
      }
      await delay(65);
    }

    const status = (await this.prisma.broadcastCampaign.findUnique({ where: { id: campaignId }, select: { status: true } }))?.status === "cancelled" ? "cancelled" : "sent";
    await this.prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status, sentCount, failedCount } });
  }

  private async selectBroadcastUsers(segment: string) {
    const activeFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (segment === "active_30d") {
      return this.prisma.botUser.findMany({ where: { lastSeenAt: { gte: activeFrom } }, select: { telegramId: true } });
    }
    if (segment === "bound_faceit") {
      return this.prisma.botUser.findMany({ where: { boundFaceitNickname: { not: null } }, select: { telegramId: true } });
    }
    if (segment === "favorites") {
      return this.prisma.botUser.findMany({ where: { favorites: { some: {} } }, select: { telegramId: true } });
    }
    return this.prisma.botUser.findMany({ select: { telegramId: true } });
  }

  private async sendBroadcastMessage(telegramId: string, campaign: { mediaType: string | null; mediaUrl: string | null; caption: string; buttons: unknown }) {
    const token = this.config.get<string>("BOT_TOKEN");
    if (!token) {
      throw new Error("BOT_TOKEN is not configured");
    }
    const replyMarkup = buildBroadcastReplyMarkup(campaign.buttons);
    const payload: Record<string, unknown> = {
      chat_id: telegramId,
      reply_markup: replyMarkup
    };
    let method = "sendMessage";
    if (campaign.mediaUrl && campaign.mediaType === "photo") {
      method = "sendPhoto";
      payload.photo = this.publicUrl(campaign.mediaUrl);
      payload.caption = campaign.caption;
    } else if (campaign.mediaUrl && campaign.mediaType === "video") {
      method = "sendVideo";
      payload.video = this.publicUrl(campaign.mediaUrl);
      payload.caption = campaign.caption;
    } else {
      payload.text = campaign.caption;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.status === 429) {
      const data = await response.json().catch(() => null) as { parameters?: { retry_after?: number } } | null;
      await delay(Math.min(10_000, (data?.parameters?.retry_after ?? 1) * 1000));
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Telegram ${response.status}: ${text.slice(0, 300)}`);
    }
  }

  private publicUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    const base = this.config.get<string>("ADMIN_PUBLIC_URL")?.replace(/\/$/, "") ?? "";
    return base ? `${base}${url.startsWith("/") ? url : `/${url}`}` : url;
  }

  private publicCampaign(campaign: {
    id: string;
    title: string;
    mediaType: string | null;
    mediaUrl: string | null;
    caption: string;
    buttons: unknown;
    targetSegment: string;
    status: string;
    totalCount: number;
    sentCount: number;
    failedCount: number;
    createdBy: string | null;
    sentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      ...campaign,
      sentAt: campaign.sentAt?.toISOString() ?? null,
      createdAt: campaign.createdAt.toISOString(),
      updatedAt: campaign.updatedAt.toISOString()
    };
  }

  private async trackEvent(type: string, telegramId?: string | null, metadata?: unknown) {
    await this.prisma.botEvent.create({ data: { type, telegramId: telegramId ?? null, metadata: (metadata ?? {}) as never } }).catch(() => null);
  }

  private async groupEventMetadata(type: string, key: string, from: Date) {
    const events = await this.prisma.botEvent.findMany({ where: { type, createdAt: { gte: from } }, select: { metadata: true } });
    const counts = new Map<string, number>();
    for (const event of events) {
      const metadata = event.metadata as Record<string, unknown> | null;
      const value = typeof metadata?.[key] === "string" ? metadata[key] : null;
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
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

interface BroadcastInput {
  title?: unknown;
  mediaType?: unknown;
  mediaUrl?: unknown;
  caption?: unknown;
  buttons?: unknown;
  targetSegment?: unknown;
}

function normalizeRequiredString(value: unknown, message: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new HttpException(message, HttpStatus.BAD_REQUEST);
  }
  return normalized;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSegment(value: unknown): string {
  const segment = normalizeString(value);
  return ["all", "active_30d", "bound_faceit", "favorites"].includes(segment) ? segment : "all";
}

function normalizeButtons(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const label = normalizeString(record.label);
    const url = normalizeString(record.url);
    const callbackData = normalizeString(record.callbackData);
    if (!label || (!url && !callbackData)) return [];
    return [{ label, url: url || null, callbackData: callbackData || null }];
  });
}

function buildBroadcastReplyMarkup(value: unknown) {
  const buttons = normalizeButtons(value);
  if (!buttons.length) {
    return undefined;
  }
  return {
    inline_keyboard: buttons.map((button) => [
      button.url ? { text: button.label, url: button.url } : { text: button.label, callback_data: button.callbackData }
    ])
  };
}

function rangeStart(range: string): Date {
  const days = range === "30d" ? 30 : 7;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
