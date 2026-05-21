import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminRole, type AdminUser } from "@prisma/client";
import jwt from "jsonwebtoken";
import { PrismaService } from "../prisma.service";

interface TelegramLoginPayload {
  id: string | number;
  first_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: string | number;
  hash?: string;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly botToken: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {
    this.jwtSecret = config.get<string>("JWT_SECRET") ?? "dev-secret";
    this.botToken = config.get<string>("BOT_TOKEN");
  }

  async loginWithTelegram(payload: TelegramLoginPayload) {
    if (!this.verifyTelegramPayload(payload)) {
      throw new HttpException("Telegram login verification failed", HttpStatus.UNAUTHORIZED);
    }

    const user = await this.findOrCreateAllowedAdmin(String(payload.id), payload.username, payload.first_name);
    return {
      user: this.publicUser(user),
      token: this.createToken(user)
    };
  }

  async loginDev(telegramId: string, username = "dev") {
    const enabled = this.config.get<string>("ADMIN_DEV_LOGIN") === "true";
    if (!enabled) {
      throw new HttpException("Dev login is disabled", HttpStatus.FORBIDDEN);
    }
    const user = await this.findOrCreateAllowedAdmin(telegramId, username, "Dev");
    return {
      user: this.publicUser(user),
      token: this.createToken(user)
    };
  }

  async getUserFromToken(token: string) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { sub: string };
      const user = await this.prisma.adminUser.findUnique({ where: { id: decoded.sub } });
      return user ? this.publicUser(user) : null;
    } catch {
      return null;
    }
  }

  createToken(user: { id: string; role: AdminRole; telegramId: string }) {
    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
        telegramId: user.telegramId
      },
      this.jwtSecret,
      { expiresIn: "7d" }
    );
  }

  private verifyTelegramPayload(payload: TelegramLoginPayload): boolean {
    if (!this.botToken || !payload.hash || !payload.auth_date) {
      return false;
    }

    const authDate = Number(payload.auth_date);
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > 24 * 60 * 60) {
      return false;
    }

    const dataCheckString = Object.entries(payload)
      .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secret = createHash("sha256").update(this.botToken).digest();
    const calculated = createHmac("sha256", secret).update(dataCheckString).digest("hex");
    return safeEqual(calculated, String(payload.hash));
  }

  private async findOrCreateAllowedAdmin(telegramId: string, username?: string, firstName?: string) {
    const existing = await this.prisma.adminUser.findUnique({ where: { telegramId } });
    if (existing) {
      return this.prisma.adminUser.update({
        where: { telegramId },
        data: { username, firstName }
      });
    }

    const allowlist = (this.config.get<string>("ADMIN_TELEGRAM_IDS") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const adminCount = await this.prisma.adminUser.count();

    if (allowlist.length && !allowlist.includes(telegramId)) {
      throw new HttpException("Telegram user is not allowed to access admin panel", HttpStatus.FORBIDDEN);
    }

    if (!allowlist.length && adminCount > 0) {
      throw new HttpException("Admin allowlist is empty and owner already exists", HttpStatus.FORBIDDEN);
    }

    return this.prisma.adminUser.create({
      data: {
        telegramId,
        username,
        firstName,
        role: adminCount === 0 ? AdminRole.OWNER : AdminRole.ADMIN
      }
    });
  }

  private publicUser(user: AdminUser) {
    return {
      id: user.id,
      telegramId: user.telegramId,
      username: user.username,
      firstName: user.firstName,
      role: user.role.toLowerCase(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString()
    };
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
