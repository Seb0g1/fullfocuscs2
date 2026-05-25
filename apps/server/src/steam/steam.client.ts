import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RedisService } from "../redis.service";

interface ResolveVanityResponse {
  response?: {
    success?: number;
    steamid?: string;
    message?: string;
  };
}

@Injectable()
export class SteamClient {
  private readonly apiKey: string | undefined;

  constructor(
    config: ConfigService,
    private readonly cache: RedisService
  ) {
    this.apiKey = config.get<string>("STEAM_API_KEY");
  }

  async resolveVanityUrl(vanity: string): Promise<string> {
    if (!this.apiKey) {
      throw new HttpException("Для Steam vanity-ссылки нужен STEAM_API_KEY", HttpStatus.SERVICE_UNAVAILABLE);
    }

    const cacheKey = `steam:vanity:${vanity.toLowerCase()}`;
    const cached = await this.cache.getJson<string>(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("vanityurl", vanity);
    url.searchParams.set("url_type", "1");

    const response = await fetch(url);
    if (!response.ok) {
      throw new HttpException("Steam API временно недоступен", response.status);
    }

    const json = (await response.json()) as ResolveVanityResponse;
    if (json.response?.success !== 1 || !json.response.steamid) {
      throw new HttpException("Steam профиль не найден", HttpStatus.NOT_FOUND);
    }

    await this.cache.setJson(cacheKey, json.response.steamid, 24 * 60 * 60);
    return json.response.steamid;
  }
}
