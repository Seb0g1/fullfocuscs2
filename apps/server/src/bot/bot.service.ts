import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { renderComparisonCard, renderStatCard } from "@fullfocus/card-renderer";
import { buildGrenadeCallback, GRENADE_TYPES, splitCompareInput } from "@fullfocus/shared";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Markup, Telegraf, type Context } from "telegraf";
import { GrenadesService } from "../grenades/grenades.service";
import { PrismaService } from "../prisma.service";
import { StatsService } from "../stats/stats.service";

type BotState = { mode: "stats" } | { mode: "compare" } | { mode: "idle" };

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly bot: Telegraf | null;
  private readonly states = new Map<number, BotState>();

  constructor(
    private readonly config: ConfigService,
    private readonly stats: StatsService,
    private readonly grenades: GrenadesService,
    private readonly prisma: PrismaService
  ) {
    const token = config.get<string>("BOT_TOKEN");
    this.bot = token ? new Telegraf(token) : null;
    if (this.bot) {
      this.registerHandlers(this.bot);
    }
  }

  async onModuleInit() {
    if (!this.bot) {
      return;
    }

    await this.bot.telegram.setMyCommands([
      { command: "start", description: "Запустить FullFocus cs2" },
      { command: "menu", description: "Открыть меню" }
    ]);

    const webhookUrl = this.config.get<string>("BOT_WEBHOOK_URL");
    if (webhookUrl) {
      await this.bot.telegram.setWebhook(webhookUrl);
      return;
    }

    await this.bot.launch();
  }

  async onModuleDestroy() {
    this.bot?.stop("shutdown");
  }

  async handleWebhookUpdate(update: unknown) {
    await this.bot?.handleUpdate(update as never);
  }

  private registerHandlers(bot: Telegraf) {
    bot.start((ctx) => this.sendWelcome(ctx));
    bot.command("menu", (ctx) => this.sendMenu(ctx));
    bot.action("menu", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendMenu(ctx);
    });
    bot.action("stats", async (ctx) => {
      await ctx.answerCbQuery();
      this.setState(ctx, { mode: "stats" });
      await ctx.reply("Введи FACEIT ник, ссылку на FACEIT или Steam профиль. Я соберу статистику за последние 30 матчей.");
    });
    bot.action("compare", async (ctx) => {
      await ctx.answerCbQuery();
      this.setState(ctx, { mode: "compare" });
      await ctx.reply("Введи двух игроков: `Seb0g1 vs donk666`", { parse_mode: "Markdown" });
    });
    bot.action("leaderboard", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendLeaderboard(ctx);
    });
    bot.action("settings", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendSettings(ctx);
    });
    bot.action("settings:clear_player", async (ctx) => {
      await ctx.answerCbQuery("Игрок сброшен");
      if (ctx.from?.id) {
        await this.stats.clearBotUserPlayer(String(ctx.from.id));
      }
      await this.sendSettings(ctx);
    });
    bot.action("grenades", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendGrenadeMaps(ctx);
    });
    bot.action(/^gr:m:([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendGrenadeSides(ctx, ctx.match[1]);
    });
    bot.action(/^gr:s:([^:]+):([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendGrenadeAreas(ctx, ctx.match[1], ctx.match[2]);
    });
    bot.action(/^gr:a:([^:]+):([^:]+):([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendGrenadeTypes(ctx, ctx.match[1], ctx.match[2], ctx.match[3]);
    });
    bot.action(/^gr:t:([^:]+):([^:]+):([^:]+):([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendLineupPositions(ctx, ctx.match[1], ctx.match[2], ctx.match[3], ctx.match[4]);
    });
    bot.action(/^gr:p:(.+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendLineup(ctx, ctx.match[1]);
    });
    bot.action(/^lineup:(.+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendLineup(ctx, ctx.match[1]);
    });
    bot.on("text", async (ctx) => this.handleText(ctx));
  }

  private async sendWelcome(ctx: Context) {
    const caption = await this.getSettingString(
      "welcomeText",
      "Привет! Я FullFocus cs2: FACEIT статистика, сравнение игроков и база раскидов гранат. Выбери действие кнопками ниже."
    );
    const imageUrl = await this.getSettingString("welcomeImageUrl", this.config.get<string>("BOT_WELCOME_IMAGE_URL") ?? "");
    if (imageUrl) {
      await ctx.replyWithPhoto(this.publicUrl(imageUrl), { caption, ...this.menuKeyboard() });
      return;
    }
    await ctx.reply(caption, this.menuKeyboard());
  }

  private async sendMenu(ctx: Context) {
    await ctx.reply("FullFocus cs2 | выбери действие", this.menuKeyboard());
  }

  private async handleText(ctx: Context & { message: { text: string } }) {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const state = this.states.get(userId) ?? { mode: "idle" };
    if (state.mode === "stats") {
      await this.handleStatsRequest(ctx, ctx.message.text);
      return;
    }
    if (state.mode === "compare") {
      await this.handleCompareRequest(ctx, ctx.message.text);
      return;
    }

    await ctx.reply("Выбери действие в меню или используй /menu.", this.menuKeyboard());
  }

  private async handleStatsRequest(ctx: Context, query: string) {
    this.setState(ctx, { mode: "idle" });
    await ctx.sendChatAction("upload_photo");
    try {
      const payload = await this.stats.buildPlayerStatPayload(query, 30, ctx.from ? String(ctx.from.id) : undefined);
      if (ctx.from) {
        await this.stats.recordBotUser(ctx.from, payload);
      }
      const image = await renderStatCard(payload);
      await ctx.replyWithPhoto(
        { source: image },
        {
          caption: `Готово: ${payload.player.nickname} | ELO ${payload.player.elo} | LVL ${payload.player.skillLevel} | K/D ${formatNumber(payload.currentWindow.kd, 2)}`,
          ...this.afterStatsKeyboard(payload.player.nickname)
        }
      );
    } catch (error) {
      await ctx.reply(this.toUserError(error), this.menuKeyboard());
    }
  }

  private async handleCompareRequest(ctx: Context, query: string) {
    this.setState(ctx, { mode: "idle" });
    const parsed = splitCompareInput(query);
    if (!parsed) {
      await ctx.reply("Не понял пару игроков. Пример: `Seb0g1 vs donk666`", { parse_mode: "Markdown" });
      return;
    }

    await ctx.sendChatAction("upload_photo");
    try {
      const payload = await this.stats.buildComparison(parsed[0], parsed[1], 30, ctx.from ? String(ctx.from.id) : undefined);
      const image = await renderComparisonCard(payload);
      await ctx.replyWithPhoto(
        { source: image },
        {
          caption: `Сравнение готово: ${payload.left.player.nickname} vs ${payload.right.player.nickname}`,
          ...this.menuKeyboard()
        }
      );
    } catch (error) {
      await ctx.reply(this.toUserError(error), this.menuKeyboard());
    }
  }

  private async sendLeaderboard(ctx: Context) {
    const rows = await this.stats.getLeaderboard(10);
    if (!rows.length) {
      await ctx.reply("Лидерборд пока пустой. Запроси статистику игрока, и он появится здесь.", this.menuKeyboard());
      return;
    }
    const text = rows
      .map((row, index) => `${index + 1}. ${row.faceitNickname ?? row.username ?? row.telegramId} · ELO ${row.lastElo}`)
      .join("\n");
    await ctx.reply(`Лидерборд FullFocus\n\n${text}`, this.menuKeyboard());
  }

  private async sendSettings(ctx: Context) {
    const telegramId = ctx.from?.id ? String(ctx.from.id) : "";
    const user = telegramId ? await this.stats.getBotUser(telegramId) : null;
    const text = [
      "Настройки FullFocus",
      "",
      user?.faceitNickname ? `Последний FACEIT игрок: ${user.faceitNickname} | ELO ${user.lastElo ?? "-"}` : "Последний FACEIT игрок пока не выбран.",
      "Бот использует последнего найденного игрока для лидерборда и быстрых действий."
    ].join("\n");

    await ctx.reply(
      text,
      Markup.inlineKeyboard([
        ...(user?.faceitNickname ? [[Markup.button.callback("Сбросить игрока", "settings:clear_player")]] : []),
        [Markup.button.callback("Меню", "menu")]
      ])
    );
  }

  private async sendGrenadeMaps(ctx: Context) {
    const maps = await this.grenades.listPublishedMaps();
    if (!maps.length) {
      await ctx.reply("Пока нет опубликованных раскидов. Добавь их в админке.", this.menuKeyboard());
      return;
    }
    await ctx.reply(
      "На какой карте нужен раскид?",
      Markup.inlineKeyboard([
        ...chunkButtons(maps.map((map) => Markup.button.callback(map.name, buildGrenadeCallback({ kind: "map", mapSlug: map.slug }))), 2),
        [Markup.button.callback("Главное меню", "menu")]
      ])
    );
  }

  private async sendGrenadeSides(ctx: Context, mapSlug: string) {
    const [maps, sides] = await Promise.all([this.grenades.listPublishedMaps(), this.grenades.listSidesForMap(mapSlug)]);
    const map = maps.find((item) => item.slug === mapSlug);
    if (!map || !sides.length) {
      await ctx.reply("Для этой карты пока нет опубликованных раскидов.", this.grenadeBackToMapsKeyboard());
      return;
    }

    const keyboard = Markup.inlineKeyboard([
      sides.map((side) => Markup.button.callback(sideLabel(side), buildGrenadeCallback({ kind: "side", mapSlug, side }))),
      [Markup.button.callback("Назад к выбору карт", "grenades")],
      [Markup.button.callback("Главное меню", "menu")]
    ]);
    const text = `Карта: ${map.name}\nВыбери сторону.`;
    if (map.overviewImageUrl) {
      await ctx.replyWithPhoto(this.publicUrl(map.overviewImageUrl), { caption: text, ...keyboard });
      return;
    }
    await ctx.reply(text, keyboard);
  }

  private async sendGrenadeAreas(ctx: Context, mapSlug: string, side: string) {
    const areas = await this.grenades.listAreas({ mapSlug, side });
    if (!areas.length) {
      await ctx.reply("Для этой стороны пока нет опубликованных раскидов.", this.grenadeBackToMapsKeyboard());
      return;
    }

    await ctx.reply(
      "Выбери часть карты:",
      Markup.inlineKeyboard([
        ...chunkButtons(
          areas.map((area) =>
            Markup.button.callback(area.area, buildGrenadeCallback({ kind: "area", mapSlug, side: normalizeSide(side), areaSlug: area.areaSlug }))
          ),
          3
        ),
        [Markup.button.callback("Назад", buildGrenadeCallback({ kind: "map", mapSlug }))],
        [Markup.button.callback("Главное меню", "menu")]
      ])
    );
  }

  private async sendGrenadeTypes(ctx: Context, mapSlug: string, side: string, areaSlug: string) {
    const types = await this.grenades.listTypesForSelection({ mapSlug, side, areaSlug });
    const buttons = GRENADE_TYPES.filter((type) => types.includes(type.slug)).map((type) =>
      Markup.button.callback(type.label, buildGrenadeCallback({ kind: "type", mapSlug, side: normalizeSide(side), areaSlug, grenadeType: type.slug }))
    );
    if (!buttons.length) {
      await ctx.reply("Для этой части карты пока нет опубликованных гранат.", this.grenadeBackToMapsKeyboard());
      return;
    }

    await ctx.reply(
      "Выбери тип гранаты:",
      Markup.inlineKeyboard([
        ...chunkButtons(buttons, 3),
        [Markup.button.callback("Назад", buildGrenadeCallback({ kind: "side", mapSlug, side: normalizeSide(side) }))],
        [Markup.button.callback("Главное меню", "menu")]
      ])
    );
  }

  private async sendLineupPositions(ctx: Context, mapSlug: string, side: string, areaSlug: string, type: string) {
    const lineups = await this.grenades.listLineups({ mapSlug, side, areaSlug, type, published: true });
    if (!lineups.length) {
      await ctx.reply("Не нашел опубликованных раскидов по этому фильтру.", this.grenadeBackToMapsKeyboard());
      return;
    }

    if (lineups.length === 1) {
      await ctx.sendChatAction("upload_photo").catch(() => undefined);
      await this.sendLineup(ctx, lineups[0].id);
      return;
    }

    await ctx.reply(
      "Выбери позицию:",
      Markup.inlineKeyboard([
        ...chunkButtons(
          lineups.slice(0, 24).map((lineup) => Markup.button.callback(lineupButtonLabel(lineup), buildGrenadeCallback({ kind: "position", lineupId: lineup.id }))),
          2
        ),
        [Markup.button.callback("Назад", buildGrenadeCallback({ kind: "area", mapSlug, side: normalizeSide(side), areaSlug }))],
        [Markup.button.callback("К выбору карты", "grenades")]
      ])
    );
  }

  private async sendLineup(ctx: Context, id: string) {
    const lineup = await this.grenades.getLineup(id, true);
    if (!lineup) {
      await ctx.reply("Раскид не найден или снят с публикации.", this.menuKeyboard());
      return;
    }

    const caption = [
      `${lineup.mapName} · ${grenadeTypeLabel(lineup.grenadeType)} · ${sideLabel(lineup.side)}`,
      lineup.title,
      "",
      `Откуда: ${lineup.from}`,
      `Куда: ${lineup.to}`,
      `Часть карты: ${lineup.area}`,
      `Сложность: ${difficultyLabel(lineup.difficulty)}`,
      "",
      lineup.description
    ].join("\n");
    const mediaItems = lineup.mediaItems.length
      ? lineup.mediaItems
      : [{ type: lineup.mediaType, url: lineup.mediaUrl, thumbnailUrl: lineup.thumbnailUrl, caption: lineup.title }];
    const media = mediaItems.filter((item) => item.url).slice(0, 10);

    if (!media.length) {
      await ctx.reply(caption, this.menuKeyboard());
      return;
    }

    if (media.length === 1) {
      const item = media[0];
      try {
        if (item.type === "video") {
          await ctx.replyWithVideo(this.telegramMedia(item.url), { caption, ...this.lineupKeyboard(lineup) });
        } else if (item.type === "image") {
          await ctx.replyWithPhoto(this.telegramMedia(item.url), { caption, ...this.lineupKeyboard(lineup) });
        } else {
          await ctx.reply(`${caption}\n\n${this.publicUrl(item.url)}`, this.lineupKeyboard(lineup));
        }
      } catch {
        await this.replyLineupFallback(ctx, caption, [item.url], lineup);
      }
      return;
    }

    const album = media
      .filter((item) => item.type === "image" || item.type === "video")
      .map((item, index) => ({
        type: item.type === "video" ? "video" : "photo",
        media: this.telegramMedia(item.url),
        caption: index === 0 ? caption : item.caption ?? undefined
      }));

    if (album.length) {
      try {
        await ctx.replyWithMediaGroup(album as never);
        await ctx.reply("Готово. Можешь выбрать ещё одну позицию или вернуться в меню.", this.lineupKeyboard(lineup));
      } catch {
        await this.replyLineupFallback(ctx, caption, media.map((item) => item.url), lineup);
      }
      return;
    }

    await ctx.reply(`${caption}\n\n${media.map((item) => this.publicUrl(item.url)).join("\n")}`, this.lineupKeyboard(lineup));
  }

  private menuKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback("Статистика", "stats"),
        Markup.button.callback("Сравнить", "compare")
      ],
      [
        Markup.button.callback("Раскид гранат", "grenades"),
        Markup.button.callback("Лидерборд", "leaderboard")
      ],
      [Markup.button.callback("Настройки", "settings")]
    ]);
  }

  private grenadeBackToMapsKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback("К выбору карты", "grenades")],
      [Markup.button.callback("Главное меню", "menu")]
    ]);
  }

  private afterStatsKeyboard(nickname: string) {
    return Markup.inlineKeyboard([
      [Markup.button.url("Открыть FACEIT", `https://www.faceit.com/ru/players/${encodeURIComponent(nickname)}`)],
      [
        Markup.button.callback("Новый поиск", "stats"),
        Markup.button.callback("Меню", "menu")
      ]
    ]);
  }

  private lineupKeyboard(lineup: { mapSlug: string; side: string; areaSlug: string; grenadeType: string }) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "Назад к позициям",
          buildGrenadeCallback({
            kind: "type",
            mapSlug: lineup.mapSlug,
            side: normalizeSide(lineup.side),
            areaSlug: lineup.areaSlug,
            grenadeType: lineup.grenadeType
          })
        )
      ],
      [
        Markup.button.callback("К выбору карты", "grenades"),
        Markup.button.callback("Меню", "menu")
      ]
    ]);
  }

  private setState(ctx: Context, state: BotState) {
    if (ctx.from?.id) {
      this.states.set(ctx.from.id, state);
    }
  }

  private publicUrl(url: string): string {
    if (url.startsWith("http")) {
      return url;
    }
    const base = this.config.get<string>("ADMIN_PUBLIC_URL")?.replace(/\/$/, "");
    return base && url.startsWith("/") ? `${base}${url}` : url;
  }

  private telegramMedia(url: string): string | { source: string } {
    const localFile = this.localMediaPath(url);
    return localFile ?? this.publicUrl(url);
  }

  private localMediaPath(url: string): { source: string } | null {
    const filename = this.mediaFilename(url);
    if (!filename) {
      return null;
    }

    const mediaRoot = this.config.get<string>("MEDIA_ROOT") ?? "./media";
    const filePath = join(mediaRoot, filename);
    return existsSync(filePath) ? { source: filePath } : null;
  }

  private mediaFilename(url: string): string | null {
    let pathname = url;
    if (url.startsWith("http")) {
      try {
        const parsed = new URL(url);
        const publicBase = this.config.get<string>("ADMIN_PUBLIC_URL");
        if (publicBase && parsed.origin !== new URL(publicBase).origin) {
          return null;
        }
        pathname = parsed.pathname;
      } catch {
        return null;
      }
    }

    if (!pathname.startsWith("/media/")) {
      return null;
    }

    const filename = basename(decodeURIComponent(pathname));
    return /^[a-z0-9-]+\.(png|jpe?g|webp|gif|mp4|webm|mov)$/i.test(filename) ? filename : null;
  }

  private async replyLineupFallback(ctx: Context, caption: string, urls: string[], lineup: { mapSlug: string; side: string; areaSlug: string; grenadeType: string }) {
    const links = urls.map((url) => this.publicUrl(url)).join("\n");
    await ctx.reply(`${caption}\n\nМедиа не удалось отправить файлом, открой ссылку:\n${links}`, this.lineupKeyboard(lineup));
  }

  private async getSettingString(key: string, fallback = ""): Promise<string> {
    const setting = await this.prisma.botSetting.findUnique({ where: { key } }).catch(() => null);
    const value = setting?.value;
    if (typeof value === "string") {
      return value.trim() || fallback;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      const candidate = typeof record.text === "string" ? record.text : typeof record.url === "string" ? record.url : "";
      return candidate.trim() || fallback;
    }
    return fallback;
  }

  private toUserError(error: unknown): string {
    if (error instanceof Error) {
      return `Не получилось выполнить запрос: ${translateUserError(error.message)}`;
    }
    return "Не получилось выполнить запрос. Попробуй позже.";
  }
}

function chunkButtons<T>(buttons: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < buttons.length; index += size) {
    rows.push(buttons.slice(index, index + size));
  }
  return rows;
}

function normalizeSide(side: string): "t" | "ct" {
  return side.toLowerCase() === "ct" ? "ct" : "t";
}

function lineupButtonLabel(lineup: { from: string; to: string; title: string }): string {
  if (lineup.from && lineup.to && lineup.from !== lineup.to) {
    return `${lineup.from} → ${lineup.to}`.slice(0, 48);
  }
  return (lineup.to || lineup.title).slice(0, 48);
}

function sideLabel(side: string): string {
  const normalized = side.toLowerCase();
  if (normalized === "ct") return "CT";
  if (normalized === "both") return "T/CT";
  return "T";
}

function grenadeTypeLabel(type: string): string {
  return GRENADE_TYPES.find((item) => item.slug === type)?.label ?? type.toUpperCase();
}

function difficultyLabel(value: string): string {
  if (value === "hard") return "сложно";
  if (value === "medium") return "средне";
  return "легко";
}

function formatNumber(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0+$/, "");
}

function translateUserError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found") || normalized.includes("не найден")) {
    return "игрок не найден. Проверь ник или ссылку.";
  }
  if (normalized.includes("rate limit") || normalized.includes("огранич")) {
    return "FACEIT временно ограничил запросы. Попробуй чуть позже.";
  }
  if (normalized.includes("temporarily unavailable") || normalized.includes("временно недоступ")) {
    return "внешний API временно недоступен. Попробуй позже.";
  }
  if (normalized.includes("api key") || normalized.includes("ключ")) {
    return "нужный API ключ не настроен на сервере.";
  }
  return message || "попробуй позже.";
}
