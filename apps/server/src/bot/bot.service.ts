import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { renderComparisonCard, renderStatCard } from "@fullfocus/card-renderer";
import { buildGrenadeCallback, GRENADE_TYPES, splitCompareInput } from "@fullfocus/shared";
import { Markup, Telegraf, type Context } from "telegraf";
import { GrenadesService } from "../grenades/grenades.service";
import { StatsService } from "../stats/stats.service";

type BotState = { mode: "stats" } | { mode: "compare" } | { mode: "idle" };

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly bot: Telegraf | null;
  private readonly states = new Map<number, BotState>();

  constructor(
    private readonly config: ConfigService,
    private readonly stats: StatsService,
    private readonly grenades: GrenadesService
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
      await ctx.reply("Введи FACEIT ник, FACEIT ссылку или Steam профиль.");
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
      await ctx.reply("Настройки появятся здесь позже. Сейчас бот запоминает последнего найденного FACEIT игрока для лидерборда.");
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
    const caption =
      "Привет! Я FullFocus cs2: FACEIT статистика, сравнение игроков и база раскидов гранат. Выбери действие кнопками ниже.";
    const imageUrl = this.config.get<string>("BOT_WELCOME_IMAGE_URL");
    if (imageUrl) {
      await ctx.replyWithPhoto(this.publicUrl(imageUrl), { caption, ...this.menuKeyboard() });
      return;
    }
    await ctx.reply(caption, this.menuKeyboard());
  }

  private async sendMenu(ctx: Context) {
    await ctx.reply("FullFocus cs2 | меню", this.menuKeyboard());
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
          caption: `Статистика ${payload.player.nickname}: ELO ${payload.player.elo}, LVL ${payload.player.skillLevel}, K/D ${payload.currentWindow.kd}`,
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
          caption: `${payload.left.player.nickname} vs ${payload.right.player.nickname}`,
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
      await ctx.reply("Лидерборд пока пустой. Запроси статистику игрока, и он появится здесь.");
      return;
    }
    const text = rows
      .map((row, index) => `${index + 1}. ${row.faceitNickname ?? row.username ?? row.telegramId} · ELO ${row.lastElo}`)
      .join("\n");
    await ctx.reply(`Лидерборд FullFocus\n\n${text}`, this.menuKeyboard());
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

    await ctx.reply(
      "Выбери позицию:",
      Markup.inlineKeyboard([
        ...chunkButtons(
          lineups.slice(0, 24).map((lineup) => Markup.button.callback(lineup.to || lineup.title, buildGrenadeCallback({ kind: "position", lineupId: lineup.id }))),
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
      if (item.type === "video") {
        await ctx.replyWithVideo(this.publicUrl(item.url), { caption, ...this.menuKeyboard() });
      } else if (item.type === "image") {
        await ctx.replyWithPhoto(this.publicUrl(item.url), { caption, ...this.menuKeyboard() });
      } else {
        await ctx.reply(`${caption}\n\n${this.publicUrl(item.url)}`, this.menuKeyboard());
      }
      return;
    }

    const album = media
      .filter((item) => item.type === "image" || item.type === "video")
      .map((item, index) => ({
        type: item.type === "video" ? "video" : "photo",
        media: this.publicUrl(item.url),
        caption: index === 0 ? caption : item.caption ?? undefined
      }));

    if (album.length) {
      await ctx.replyWithMediaGroup(album as never);
      await ctx.reply("Готово. Можешь выбрать ещё одну позицию или вернуться в меню.", this.menuKeyboard());
      return;
    }

    await ctx.reply(`${caption}\n\n${media.map((item) => this.publicUrl(item.url)).join("\n")}`, this.menuKeyboard());
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

  private toUserError(error: unknown): string {
    if (error instanceof Error) {
      return `Не получилось выполнить запрос: ${error.message}`;
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
