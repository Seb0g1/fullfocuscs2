import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis.service";

const MAX_AVATAR_BYTES = 1_500_000;
const AVATAR_TTL_SECONDS = 60 * 60 * 24 * 14;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

@Injectable()
export class AvatarService {
  constructor(private readonly cache: RedisService) {}

  async prepareAvatarDataUri(url: string | null | undefined): Promise<string | null> {
    if (!url || !isSafeImageUrl(url)) {
      return null;
    }

    const cacheKey = `avatar:data:${createHash("sha256").update(url).digest("hex")}`;
    const cached = await this.cache.getJson<{ dataUri: string }>(cacheKey);
    if (cached?.dataUri) {
      return cached.dataUri;
    }

    const dataUri = await this.fetchDataUri(url).catch(() => null);
    if (!dataUri) {
      return null;
    }

    await this.cache.setJson(cacheKey, { dataUri }, AVATAR_TTL_SECONDS);
    return dataUri;
  }

  private async fetchDataUri(url: string): Promise<string | null> {
    const response = await fetch(url, {
      headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*" },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) {
      return null;
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      return null;
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_AVATAR_BYTES) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.byteLength > MAX_AVATAR_BYTES) {
      return null;
    }

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }
}

export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeContentType(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.split(";")[0]?.trim().toLowerCase() || null;
}
