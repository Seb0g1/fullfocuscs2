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
      const fetchLimit = Math.max(window * 2, 60);
      const [matchStats, history] = await Promise.all([
        this.faceit.getPlayerMatchStats(player.playerId, fetchLimit),
        this.faceit.getPlayerHistory(player.playerId, fetchLimit).catch(() => ({ items: [] }))
      ]);
      await this.faceit.getPlayerLifetimeStats(player.playerId).catch(() => null);

      const records = (matchStats.items ?? [])
        .map((item) => this.normalizeMatchStats(item.stats ?? {}))
        .filter((record) => record.kills || record.deaths || record.result);

      const currentWindow = calculateWindowStats(records, window);
      if (currentWindow.matches && currentWindow.eloSeries.length < 2) {
        currentWindow.eloSeries = estimateEloTrend(records.slice(0, window), player.elo);
      }
      const previousWindow = records.length > window ? calculateWindowStats(records.slice(window), window) : null;
      const payload: StatCardPayload = {
        generatedAt: new Date().toISOString(),
        botName: "FullFocus cs2",
        seasonLabel: `SEASON ${new Date().getFullYear()}`,
        player,
        currentWindow,
        previousWindow,
        highlights: buildHighlights(records.slice(0, window)),
        topTeammates: buildTopTeammates(history.items ?? [], player.playerId, window),
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

  async recordBotUser(telegramUser: { id: number; username?: string; first_name?: string }, payload: StatCardPayload, options: { bind?: boolean } = {}) {
    const bindData = options.bind
      ? {
          boundFaceitPlayerId: payload.player.playerId,
          boundFaceitNickname: payload.player.nickname,
          boundFaceitElo: payload.player.elo,
          boundAt: new Date()
        }
      : {};

    await this.prisma.botUser.upsert({
      where: { telegramId: String(telegramUser.id) },
      update: {
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        faceitPlayerId: payload.player.playerId,
        faceitNickname: payload.player.nickname,
        lastElo: payload.player.elo,
        ...bindData,
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
        ...(options.bind
          ? bindData
          : {
              boundFaceitPlayerId: null,
              boundFaceitNickname: null,
              boundFaceitElo: null,
              boundAt: null
            }),
        requests: 1
      }
    });
  }

  async getLeaderboard(limit = 10) {
    return this.prisma.botUser.findMany({
      where: { boundFaceitElo: { not: null } },
      orderBy: [{ boundFaceitElo: "desc" }, { requests: "desc" }],
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

  async clearBoundFaceit(telegramId: string) {
    await this.prisma.botUser
      .update({
        where: { telegramId },
        data: {
          boundFaceitPlayerId: null,
          boundFaceitNickname: null,
          boundFaceitElo: null,
          boundAt: null
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

function estimateEloTrend(recordsNewestFirst: MatchStatRecord[], currentElo: number): number[] {
  if (!recordsNewestFirst.length || !currentElo) {
    return [];
  }

  let cursor = currentElo;
  const points = [cursor];
  for (const record of recordsNewestFirst) {
    cursor -= estimatedEloDelta(record);
    points.push(cursor);
  }
  return points.reverse().map((value) => Math.round(value));
}

function estimatedEloDelta(record: MatchStatRecord): number {
  const base = record.result === "W" ? 22 : record.result === "L" ? -22 : 0;
  const kd = record.kd ?? (record.deaths > 0 ? record.kills / record.deaths : record.kills);
  const performance = Math.max(-4, Math.min(4, Math.round((kd - 1) * 4)));
  return base + performance;
}

function buildTopTeammates(historyItems: Record<string, unknown>[], playerId: string, window: number): StatCardPayload["topTeammates"] {
  const teammates = new Map<string, { nickname: string; matches: number; wins: number; losses: number; lastSeenIndex: number }>();

  historyItems.slice(0, window).forEach((item, index) => {
    const team = findPlayerTeam(item, playerId);
    if (!team) {
      return;
    }

    const won = didTeamWin(item, team.key, team.team);
    for (const mate of team.players) {
      if (mate.playerId === playerId) {
        continue;
      }
      const current = teammates.get(mate.playerId) ?? {
        nickname: mate.nickname,
        matches: 0,
        wins: 0,
        losses: 0,
        lastSeenIndex: index
      };
      current.matches += 1;
      current.lastSeenIndex = Math.min(current.lastSeenIndex, index);
      if (won === true) current.wins += 1;
      if (won === false) current.losses += 1;
      teammates.set(mate.playerId, current);
    }
  });

  return Array.from(teammates.values())
    .sort((left, right) => right.matches - left.matches || right.wins - left.wins || left.lastSeenIndex - right.lastSeenIndex)
    .slice(0, 4)
    .map(({ nickname, matches, wins, losses }) => ({ nickname, matches, wins, losses }));
}

function findPlayerTeam(item: Record<string, unknown>, playerId: string): { key: string; team: Record<string, unknown>; players: Array<{ playerId: string; nickname: string }> } | null {
  const teams = recordValue(item.teams);
  for (const [key, rawTeam] of Object.entries(teams)) {
    const team = recordValue(rawTeam);
    const players = arrayValue(team.players)
      .map((rawPlayer) => {
        const player = recordValue(rawPlayer);
        const id = stringValue(player.player_id);
        const nickname = stringValue(player.nickname) || stringValue(player.game_player_name) || "unknown";
        return id ? { playerId: id, nickname } : null;
      })
      .filter((player): player is { playerId: string; nickname: string } => Boolean(player));

    if (players.some((player) => player.playerId === playerId)) {
      return { key, team, players };
    }
  }
  return null;
}

function didTeamWin(item: Record<string, unknown>, teamKey: string, team: Record<string, unknown>): boolean | null {
  const results = recordValue(item.results);
  const winner = stringValue(results.winner).toLowerCase();
  if (!winner) {
    return null;
  }

  const candidates = [teamKey, stringValue(team.team_id), stringValue(team.nickname)]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return candidates.includes(winner);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
