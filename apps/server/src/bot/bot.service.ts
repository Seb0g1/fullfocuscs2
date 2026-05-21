import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { renderComparisonCard, renderStatCard } from "@fullfocus/card-renderer";
import { GRENADE_TYPES, splitCompareInput } from "@fullfocus/shared";
import { Markup, Telegraf, type Context } from "telegraf";
import { GrenadesService } from "../grenades/grenades.service";
import { StatsService } from "../stats/stats.service";

type BotState =
  | { mode: "stats" }
  | { mode: "compare" }
  | { mode: "idle" };

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
    bot.action(/^grenade:map:(.+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      const mapSlug = ctx.match[1];
      await this.sendGrenadeTypes(ctx, mapSlug);
    });
    bot.action(/^grenade:type:([^:]+):([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      const [, mapSlug, type] = ctx.match;
      await this.sendLineups(ctx, mapSlug, type);
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
      await ctx.replyWithPhoto(imageUrl, { caption, ...this.menuKeyboard() });
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
      "Выбери карту:",
      Markup.inlineKeyboard(maps.map((map) => [Markup.button.callback(map.name, `grenade:map:${map.slug}`)]))
    );
  }

  private async sendGrenadeTypes(ctx: Context, mapSlug: string) {
    const types = await this.grenades.listTypesForMap(mapSlug);
    const buttons = GRENADE_TYPES.filter((type) => types.includes(type.slug)).map((type) => [
      Markup.button.callback(type.label, `grenade:type:${mapSlug}:${type.slug}`)
    ]);
    if (!buttons.length) {
      await ctx.reply("Для этой карты пока нет опубликованных гранат.", this.menuKeyboard());
      return;
    }
    await ctx.reply("Выбери тип гранаты:", Markup.inlineKeyboard(buttons));
  }

  private async sendLineups(ctx: Context, mapSlug: string, type: string) {
    const lineups = await this.grenades.listLineups({ mapSlug, type, published: true });
    if (!lineups.length) {
      await ctx.reply("Не нашел опубликованных раскидов по этому фильтру.", this.menuKeyboard());
      return;
    }
    await ctx.reply(
      "Выбери раскид:",
      Markup.inlineKeyboard(
        lineups.slice(0, 20).map((lineup) => [
          Markup.button.callback(`${lineup.from} → ${lineup.to}`, `lineup:${lineup.id}`)
        ])
      )
    );
  }

  private async sendLineup(ctx: Context, id: string) {
    const lineup = await this.grenades.getLineup(id, true);
    if (!lineup) {
      await ctx.reply("Раскид не найден или снят с публикации.", this.menuKeyboard());
      return;
    }
    const text = `${lineup.mapName} · ${lineup.grenadeType.toUpperCase()}\n${lineup.title}\n\nОткуда: ${lineup.from}\nКуда: ${lineup.to}\nСложность: ${lineup.difficulty}\n\n${lineup.description}`;
    if (lineup.mediaType === "image") {
      await ctx.replyWithPhoto(lineup.mediaUrl, { caption: text, ...this.menuKeyboard() });
    } else if (lineup.mediaType === "video") {
      await ctx.replyWithVideo(lineup.mediaUrl, { caption: text, ...this.menuKeyboard() });
    } else {
      await ctx.reply(`${text}\n\n${lineup.mediaUrl}`, this.menuKeyboard());
    }
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

  private toUserError(error: unknown): string {
    if (error instanceof Error) {
      return `Не получилось выполнить запрос: ${error.message}`;
    }
    return "Не получилось выполнить запрос. Попробуй позже.";
  }
}
