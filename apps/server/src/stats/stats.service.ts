import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import {
  buildHighlights,
  calculateWindowStats,
  GAME_ID,
  inferRole,
  parsePlayerLookupInput,
  type ComparisonSummary,
  type MatchStatRecord,
  type PlayerSummary,
  type StatCardPayload
} from "@fullfocus/shared";
import { PrismaService } from "../prisma.service";
import { FaceitClient } from "../faceit/faceit.client";
import { SteamClient } from "../steam/steam.client";
import { AvatarService } from "./avatar.service";

const NUMBER_KEYS: Record<keyof Omit<MatchStatRecord, "matchId" | "finishedAt" | "result">, string[]> = {
  kills: ["Kills", "kills"],
  deaths: ["Deaths", "deaths"],
  assists: ["Assists", "assists"],
  adr: ["ADR", "Average Damage per Round", "Damage/Round"],
  headshotsPercent: ["Headshots %", "Headshot %", "HS%", "Headshots Percentage"],
  kd: ["K/D Ratio", "K/D", "KD"],
  kr: ["K/R Ratio", "K/R", "KR"],
  elo: ["Elo", "ELO", "New Elo", "elo"]
};

@Injectable()
export class StatsService {
  constructor(
    private readonly faceit: FaceitClient,
    private readonly steam: SteamClient,
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarService
  ) {}

  async buildPlayerStatPayload(input: string, window = 30, telegramId?: string): Promise<StatCardPayload> {
    try {
      const player = await this.resolvePlayer(input);
      const matchStats = await this.faceit.getPlayerMatchStats(player.playerId, Math.max(window * 2, 60));
      await this.faceit.getPlayerLifetimeStats(player.playerId).catch(() => null);

      const records = (matchStats.items ?? [])
        .map((item) => this.normalizeMatchStats(item.stats ?? {}))
        .filter((record) => record.kills || record.deaths || record.result);

      const currentWindow = calculateWindowStats(records, window);
      const previousWindow = records.length > window ? calculateWindowStats(records.slice(window), window) : null;
      const payload: StatCardPayload = {
        generatedAt: new Date().toISOString(),
        botName: "FullFocus cs2",
        seasonLabel: `SEASON ${new Date().getFullYear()}`,
        player,
        currentWindow,
        previousWindow,
        highlights: buildHighlights(records.slice(0, window)),
        topTeammates: [],
        role: inferRole(currentWindow)
      };

      await this.recordQuery(input, payload, "ok", telegramId);
      return payload;
    } catch (error) {
      await this.recordQuery(input, null, this.errorStatus(error), telegramId);
      throw error;
    }
  }

  async buildComparison(leftInput: string, rightInput: string, window = 30, telegramId?: string): Promise<ComparisonSummary> {
    const [left, right] = await Promise.all([
      this.buildPlayerStatPayload(leftInput, window, telegramId),
      this.buildPlayerStatPayload(rightInput, window, telegramId)
    ]);

    return {
      generatedAt: new Date().toISOString(),
      botName: "FullFocus cs2",
      seasonLabel: `SEASON ${new Date().getFullYear()}`,
      window,
      left,
      right
    };
  }

  async recordBotUser(telegramUser: { id: number; username?: string; first_name?: string }, payload: StatCardPayload) {
    await this.prisma.botUser.upsert({
      where: { telegramId: String(telegramUser.id) },
      update: {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        faceitPlayerId: payload.player.playerId,
        faceitNickname: payload.player.nickname,
        lastElo: payload.player.elo,
        requests: { increment: 1 },
        lastSeenAt: new Date()
      },
      create: {
        telegramId: String(telegramUser.id),
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        faceitPlayerId: payload.player.playerId,
        faceitNickname: payload.player.nickname,
        lastElo: payload.player.elo,
        requests: 1
      }
    });
  }

  async getLeaderboard(limit = 10) {
    return this.prisma.botUser.findMany({
      where: { lastElo: { not: null } },
      orderBy: [{ lastElo: "desc" }, { requests: "desc" }],
      take: limit
    });
  }

  async getBotUser(telegramId: string) {
    return this.prisma.botUser.findUnique({ where: { telegramId } });
  }

  async clearBotUserPlayer(telegramId: string) {
    await this.prisma.botUser
      .update({
        where: { telegramId },
        data: {
          faceitPlayerId: null,
          faceitNickname: null,
          lastElo: null
        }
      })
      .catch(() => undefined);
  }

  private async resolvePlayer(input: string): Promise<PlayerSummary> {
    const parsed = parsePlayerLookupInput(input);
    let player: Record<string, unknown>;

    if (parsed.kind === "steam_id64") {
      player = await this.faceit.getPlayerBySteamId(parsed.value);
    } else if (parsed.kind === "steam_profile_url") {
      const steamId = parsed.isSteamVanity ? await this.steam.resolveVanityUrl(parsed.value) : parsed.value;
      player = await this.faceit.getPlayerBySteamId(steamId);
    } else {
      player = await this.faceit.getPlayerByNickname(parsed.value);
    }

    const summary = this.normalizePlayer(player);
    summary.avatarDataUri = await this.avatars.prepareAvatarDataUri(summary.avatar);
    return summary;
  }

  private normalizePlayer(player: Record<string, unknown>): PlayerSummary {
    const playerId = stringValue(player.player_id);
    const games = recordValue(player.games);
    const game = recordValue(games[GAME_ID]);

    if (!playerId || !game) {
      throw new HttpException("У игрока FACEIT нет данных по CS2", HttpStatus.NOT_FOUND);
    }

    return {
      playerId,
      nickname: stringValue(player.nickname) || stringValue(game.game_player_name) || "unknown",
      avatar: stringValue(player.avatar) || null,
      country: stringValue(player.country) || null,
      faceitUrl: stringValue(player.faceit_url) || null,
      steamId64: stringValue(player.steam_id_64) || stringValue(player.new_steam_id) || null,
      elo: numberValue(game.faceit_elo) ?? 0,
      skillLevel: numberValue(game.skill_level) ?? 0,
      skillLevelLabel: stringValue(game.skill_level_label) || null
    };
  }

  private normalizeMatchStats(stats: Record<string, unknown>): MatchStatRecord {
    const resultRaw = stringValue(getByKeys(stats, ["Result", "result", "Winner", "Win"]));
    const result = parseResult(resultRaw);

    return {
      matchId: stringValue(getByKeys(stats, ["Match Id", "Match ID", "match_id"])) || undefined,
      finishedAt: numberValue(getByKeys(stats, ["Match Finished At", "Finished At"])) ?? undefined,
      result,
      kills: numberValue(getByKeys(stats, NUMBER_KEYS.kills)) ?? 0,
      deaths: numberValue(getByKeys(stats, NUMBER_KEYS.deaths)) ?? 0,
      assists: numberValue(getByKeys(stats, NUMBER_KEYS.assists)) ?? 0,
      adr: numberValue(getByKeys(stats, NUMBER_KEYS.adr)),
      headshotsPercent: numberValue(getByKeys(stats, NUMBER_KEYS.headshotsPercent)),
      kd: numberValue(getByKeys(stats, NUMBER_KEYS.kd)),
      kr: numberValue(getByKeys(stats, NUMBER_KEYS.kr)),
      elo: numberValue(getByKeys(stats, NUMBER_KEYS.elo))
    };
  }

  private async recordQuery(query: string, payload: StatCardPayload | null, status: string, telegramId?: string) {
    await this.prisma.playerQueryLog
      .create({
        data: {
          telegramId,
          query,
          faceitPlayerId: payload?.player.playerId,
          faceitNickname: payload?.player.nickname,
          status
        }
      })
      .catch(() => undefined);
  }

  private errorStatus(error: unknown): string {
    if (error instanceof HttpException) {
      return `error:${error.getStatus()}`;
    }
    return "error";
  }
}

function getByKeys(record: Record<string, unknown>, keys: string[]): unknown {
  const normalized = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().replace(/\s+/g, ""), value]));
  for (const key of keys) {
    const value = normalized.get(key.toLowerCase().replace(/\s+/g, ""));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace("%", "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseResult(value: string): "W" | "L" | null {
  const normalized = value.toLowerCase();
  if (["1", "w", "win", "won", "winner", "true"].includes(normalized)) {
    return "W";
  }
  if (["0", "l", "loss", "lost", "false"].includes(normalized)) {
    return "L";
  }
  return null;
}
