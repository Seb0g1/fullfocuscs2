import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FACEIT_API_BASE_URL, GAME_ID } from "@fullfocus/shared";
import { RedisService } from "../redis.service";

export class FaceitApiError extends HttpException {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message, statusCode);
  }
}

@Injectable()
export class FaceitClient {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly cache: RedisService
  ) {
    this.apiKey = config.get<string>("FACEIT_API_KEY");
  }

  getPlayerByNickname(nickname: string) {
    return this.request<Record<string, unknown>>(`/players?nickname=${encodeURIComponent(nickname)}&game=${GAME_ID}`, 120);
  }

  getPlayerBySteamId(steamId64: string) {
    return this.request<Record<string, unknown>>(
      `/players?game=${GAME_ID}&game_player_id=${encodeURIComponent(steamId64)}`,
      120
    );
  }

  getPlayerById(playerId: string) {
    return this.request<Record<string, unknown>>(`/players/${encodeURIComponent(playerId)}`, 120);
  }

  getPlayerMatchStats(playerId: string, limit = 60) {
    return this.request<{ items?: Array<{ stats?: Record<string, unknown> }> }>(
      `/players/${encodeURIComponent(playerId)}/games/${GAME_ID}/stats?offset=0&limit=${limit}`,
      180
    );
  }

  getPlayerLifetimeStats(playerId: string) {
    return this.request<Record<string, unknown>>(`/players/${encodeURIComponent(playerId)}/stats/${GAME_ID}`, 300);
  }

  private async request<T>(path: string, ttlSeconds: number): Promise<T> {
    if (!this.apiKey) {
      throw new FaceitApiError(HttpStatus.SERVICE_UNAVAILABLE, "FACEIT_API_KEY is not configured");
    }

    const cacheKey = `faceit:${path}`;
    const cached = await this.cache.getJson<T>(cacheKey);
    if (cached) {
      return cached;
    }

    const response = await fetch(`${FACEIT_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = this.toMessage(response.status, body);
      throw new FaceitApiError(response.status, message);
    }

    const json = (await response.json()) as T;
    await this.cache.setJson(cacheKey, json, ttlSeconds);
    return json;
  }

  private toMessage(status: number, body: string): string {
    if (status === 401 || status === 403) {
      return "FACEIT API rejected the configured key";
    }
    if (status === 404) {
      return "FACEIT player was not found";
    }
    if (status === 429) {
      return "FACEIT API rate limit reached";
    }
    if (status >= 500) {
      return "FACEIT API is temporarily unavailable";
    }
    return body || "FACEIT API request failed";
  }
}
