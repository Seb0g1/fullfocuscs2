import { Body, Controller, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { calculateWindowStats, type MatchStatRecord, type StatCardPayload } from "@fullfocus/shared";
import { renderStatCard } from "@fullfocus/card-renderer";
import { AuthService } from "./auth.service";
import { AdminGuard } from "./admin.guard";
import { PrismaService } from "../prisma.service";

@Controller("admin")
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService
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
  me(@Req() request: FastifyRequest & { adminUser?: unknown }) {
    return request.adminUser;
  }

  @Get("overview")
  @UseGuards(AdminGuard)
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
  async updateUser(@Param("id") id: string, @Body() body: { role?: "owner" | "admin" | "editor" }) {
    const role = body.role?.toUpperCase();
    return this.prisma.adminUser.update({
      where: { id },
      data: role ? { role: role as never } : {}
    });
  }

  @Get("settings")
  @UseGuards(AdminGuard)
  async settings() {
    return this.prisma.botSetting.findMany({ orderBy: { key: "asc" } });
  }

  @Patch("settings/:key")
  @UseGuards(AdminGuard)
  async updateSetting(@Param("key") key: string, @Body() body: { value: unknown }) {
    return this.prisma.botSetting.upsert({
      where: { key },
      update: { value: body.value as never },
      create: { key, value: body.value as never }
    });
  }

  @Post("cards/preview")
  @UseGuards(AdminGuard)
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
        skillLevel: 11,
        skillLevelLabel: "11"
      },
      currentWindow: stats,
      previousWindow: null,
      highlights: { bestAdr: 134.3, bestKd: 3.33, maxKills: 41, bestRating: 2.3 },
      topTeammates: [
        { nickname: "hasqo_", matches: 15, wins: 6, losses: 9 },
        { nickname: "Chip063", matches: 8, wins: 2, losses: 6 }
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
      secure: false,
      maxAge: 7 * 24 * 60 * 60
    });
  }
}
