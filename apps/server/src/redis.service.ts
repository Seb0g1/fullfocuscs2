import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis | null;
  private readonly memory = new Map<string, { expiresAt: number; value: string }>();

  constructor(config: ConfigService) {
    const url = config.get<string>("REDIS_URL");
    this.client = url
      ? new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false
        })
      : null;

    this.client?.connect().catch(() => undefined);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = this.client ? await this.client.get(key).catch(() => null) : this.getMemory(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (this.client) {
      const ok = await this.client.set(key, raw, "EX", ttlSeconds).catch(() => null);
      if (ok) {
        return;
      }
    }
    this.memory.set(key, { value: raw, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async onModuleDestroy() {
    await this.client?.quit().catch(() => undefined);
  }

  private getMemory(key: string): string | null {
    const item = this.memory.get(key);
    if (!item) {
      return null;
    }
    if (item.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return item.value;
  }
}
