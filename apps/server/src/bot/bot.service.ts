import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { renderComparisonCard, renderStatCard } from "@fullfocus/card-renderer";
import { buildGrenadeCallback, GRENADE_TYPES, splitCompareInput, type StatCardPayload } from "@fullfocus/shared";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Markup, Telegraf, type Context } from "telegraf";
import { GrenadesService } from "../grenades/grenades.service";
import { PrismaService } from "../prisma.service";
import { StatsService } from "../stats/stats.service";
import {
  buildCallbackButton,
  buildPlainCallbackButton,
  buildUrlButton,
  normalizeMenuButtons,
  normalizePremiumEmojiCatalog,
  parseEmojiTokens,
  type BotButtonConfig,
  type BotButtonStyle,
  type ParsedEmojiText,
  type PremiumEmojiConfig,
  type TelegramButtonLike
} from "./bot-ui";

type BotState =
  | { mode: "bind_faceit" }
  | { mode: "other_stats" }
  | { mode: "compare" }
  | { mode: "search_lineups" }
  | { mode: "idle" };

type LineupKeyboardSource = { id?: string; mapSlug: string; side: string; areaSlug: string; grenadeType: string };

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
      { command: "menu", description: "Открыть меню" },
      { command: "emoji_id", description: "Показать custom emoji id для админов" }
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
    bot.command("emoji_id", (ctx) => this.sendEmojiIds(ctx));

    bot.action("menu", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendMenu(ctx);
    });
    bot.action("stats", async (ctx) => {
      await ctx.answerCbQuery();
      await this.handleStatsEntry(ctx);
    });
    bot.action("stats:mine", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendBoundStats(ctx);
    });
    bot.action("stats:other", async (ctx) => {
      await ctx.answerCbQuery();
      this.setState(ctx, { mode: "other_stats" });
      await ctx.reply("Введи FACEIT ник, ссылку FACEIT или Steam-профиль. Привязанный ник при этом не изменится.", await this.backToMenuKeyboard());
    });
    bot.action("stats:bind", async (ctx) => {
      await ctx.answerCbQuery();
      await this.promptBindFaceit(ctx);
    });
    bot.action("compare", async (ctx) => {
      await ctx.answerCbQuery();
      this.setState(ctx, { mode: "compare" });
      await ctx.reply("Введи двух игроков в формате: `Seb0g1 vs donk666`", { parse_mode: "Markdown", ...(await this.backToMenuKeyboard()) });
    });
    bot.action("leaderboard", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendLeaderboard(ctx);
    });
    bot.action("settings", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendSettings(ctx);
    });
    bot.action("settings:bind", async (ctx) => {
      await ctx.answerCbQuery();
      await this.promptBindFaceit(ctx);
    });
    bot.action("settings:clear_bind", async (ctx) => {
      await ctx.answerCbQuery("Привязка сброшена");
      if (ctx.from?.id) {
        await this.stats.clearBoundFaceit(String(ctx.from.id));
      }
      await this.sendSettings(ctx);
    });
    bot.action("profile", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendProfile(ctx);
    });
    bot.action("favorites", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendFavorites(ctx);
    });
    bot.action(/^fav:(.+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.toggleFavorite(ctx, ctx.match[1]);
    });
    bot.action("training", async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendTrainingMaps(ctx);
    });
    bot.action(/^tr:m:([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendTrainingSides(ctx, ctx.match[1]);
    });
    bot.action(/^tr:s:([^:]+):([^:]+)$/i, async (ctx) => {
      await ctx.answerCbQuery();
      await this.sendTrainingSet(ctx, ctx.match[1], ctx.match[2]);
    });
    bot.action("search", async (ctx) => {
      await ctx.answerCbQuery();
      this.setState(ctx, { mode: "search_lineups" });
      await ctx.reply("Напиши, что ищем: например `mirage smoke ct window` или `мираж смок коннектор`.", await this.backToMenuKeyboard());
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
    await this.touchBotUser(ctx);
    const caption = await this.getSettingString(
      "welcomeText",
      "Привет! Я FullFocus cs2: FACEIT-статистика, сравнение игроков, раскиды гранат и персональный CS2-профиль. Выбери действие ниже."
    );
    const imageUrl = await this.getSettingString("welcomeImageUrl", this.config.get<string>("BOT_WELCOME_IMAGE_URL") ?? "");
    const keyboard = await this.menuKeyboard();
    if (imageUrl) {
      await ctx.replyWithPhoto(this.publicUrl(imageUrl), { caption, ...keyboard });
      return;
    }
    await ctx.reply(caption, keyboard);
  }

  private async sendMenu(ctx: Context) {
    await this.touchBotUser(ctx);
    await ctx.reply("FullFocus cs2 | выбери действие", await this.menuKeyboard());
  }

  private async handleText(ctx: Context & { message: { text: string } }) {
    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const state = this.states.get(userId) ?? { mode: "idle" };
    if (state.mode === "bind_faceit") {
      await this.handleStatsRequest(ctx, ctx.message.text, { bind: true });
      return;
    }
    if (state.mode === "other_stats") {
      await this.handleStatsRequest(ctx, ctx.message.text, { bind: false });
      return;
    }
    if (state.mode === "compare") {
      await this.handleCompareRequest(ctx, ctx.message.text);
      return;
    }
    if (state.mode === "search_lineups") {
      await this.handleLineupSearch(ctx, ctx.message.text);
      return;
    }

    await ctx.reply("Выбери действие в меню или используй /menu.", await this.menuKeyboard());
  }

  private async handleStatsEntry(ctx: Context) {
    const user = await this.getCurrentBotUser(ctx);
    if (user?.boundFaceitNickname) {
      await this.handleStatsRequest(ctx, user.boundFaceitNickname, { bind: true });
      return;
    }

    this.setState(ctx, { mode: "bind_faceit" });
    await ctx.reply(
      "Привяжи FACEIT ник один раз, и дальше кнопка «Статистика» будет сразу показывать твою карточку.\n\nВведи ник, FACEIT URL или Steam-профиль.",
      Markup.inlineKeyboard([
        [await this.button("Показать другого игрока", "stats:other", { fallbackEmoji: "🔎", style: "primary" })],
        [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async promptBindFaceit(ctx: Context) {
    this.setState(ctx, { mode: "bind_faceit" });
    await ctx.reply("Введи FACEIT ник, который нужно привязать к твоему профилю FullFocus.", await this.backToMenuKeyboard());
  }

  private async sendBoundStats(ctx: Context) {
    const user = await this.getCurrentBotUser(ctx);
    if (!user?.boundFaceitNickname) {
      await this.promptBindFaceit(ctx);
      return;
    }
    await this.handleStatsRequest(ctx, user.boundFaceitNickname, { bind: true });
  }

  private async handleStatsRequest(ctx: Context, query: string, options: { bind: boolean }) {
    this.setState(ctx, { mode: "idle" });
    await ctx.sendChatAction("upload_photo").catch(() => undefined);
    try {
      const payload = await this.stats.buildPlayerStatPayload(query, 30, ctx.from ? String(ctx.from.id) : undefined);
      if (ctx.from) {
        await this.stats.recordBotUser(ctx.from, payload, { bind: options.bind });
      }
      const image = await renderStatCard(payload);
      await ctx.replyWithPhoto(
        { source: image },
        {
          caption: this.statsCaption(payload, options.bind),
          ...(await this.afterStatsKeyboard(payload.player.nickname, options.bind))
        }
      );
    } catch (error) {
      await ctx.reply(this.toUserError(error), await this.menuKeyboard());
    }
  }

  private async handleCompareRequest(ctx: Context, query: string) {
    this.setState(ctx, { mode: "idle" });
    const parsed = splitCompareInput(query);
    if (!parsed) {
      await ctx.reply("Не понял пару игроков. Пример: `Seb0g1 vs donk666`", { parse_mode: "Markdown", ...(await this.backToMenuKeyboard()) });
      return;
    }

    await ctx.sendChatAction("upload_photo").catch(() => undefined);
    try {
      const payload = await this.stats.buildComparison(parsed[0], parsed[1], 30, ctx.from ? String(ctx.from.id) : undefined);
      const image = await renderComparisonCard(payload);
      await ctx.replyWithPhoto(
        { source: image },
        {
          caption: `Сравнение готово: ${payload.left.player.nickname} vs ${payload.right.player.nickname}`,
          ...(await this.menuKeyboard())
        }
      );
    } catch (error) {
      await ctx.reply(this.toUserError(error), await this.menuKeyboard());
    }
  }

  private async sendLeaderboard(ctx: Context) {
    const rows = await this.stats.getLeaderboard(10);
    if (!rows.length) {
      await ctx.reply("Лидерборд пока пустой. Привяжи FACEIT ник в настройках, и профиль появится здесь.", await this.menuKeyboard());
      return;
    }
    const text = rows
      .map((row, index) => `${index + 1}. ${row.boundFaceitNickname ?? row.username ?? row.telegramId} · ELO ${row.boundFaceitElo}`)
      .join("\n");
    await ctx.reply(`🏆 Лидерборд FullFocus\n\n${text}`, await this.menuKeyboard());
  }

  private async sendSettings(ctx: Context) {
    const user = await this.getCurrentBotUser(ctx);
    const text = [
      "⚙️ Настройки FullFocus",
      "",
      user?.boundFaceitNickname
        ? `Привязанный FACEIT: ${user.boundFaceitNickname} · ELO ${user.boundFaceitElo ?? "-"}`
        : "FACEIT ник ещё не привязан.",
      user?.faceitNickname && user.faceitNickname !== user.boundFaceitNickname
        ? `Последний просмотренный игрок: ${user.faceitNickname} · ELO ${user.lastElo ?? "-"}`
        : null,
      "",
      "Привязка нужна, чтобы кнопка «Статистика» сразу показывала твою карточку. Других игроков можно смотреть отдельно."
    ].filter(Boolean).join("\n");

    const rows: TelegramButtonLike[][] = [
      [await this.button(user?.boundFaceitNickname ? "Сменить FACEIT" : "Привязать FACEIT", "settings:bind", { fallbackEmoji: "🔗", style: "primary" })],
      ...(user?.boundFaceitNickname
        ? [
            [await this.button("Моя статистика", "stats:mine", { fallbackEmoji: "📈", style: "primary" })],
            [await this.button("Сбросить привязку", "settings:clear_bind", { fallbackEmoji: "🧹", style: "danger" })]
          ]
        : []),
      [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
    ];

    await ctx.reply(text, Markup.inlineKeyboard(rows as never));
  }

  private async sendProfile(ctx: Context) {
    const user = await this.getCurrentBotUser(ctx);
    const favorites = ctx.from?.id ? await this.grenades.listFavorites(String(ctx.from.id)) : [];
    const text = [
      "🎯 Мой профиль FullFocus",
      "",
      user?.boundFaceitNickname
        ? `FACEIT: ${user.boundFaceitNickname} · ELO ${user.boundFaceitElo ?? "-"}`
        : "FACEIT ник не привязан.",
      `Избранных раскидов: ${favorites.length}`,
      user?.requests ? `Запросов статистики: ${user.requests}` : null
    ].filter(Boolean).join("\n");

    await ctx.reply(
      text,
      Markup.inlineKeyboard([
        [await this.button("Моя статистика", "stats:mine", { fallbackEmoji: "📈", style: "primary" })],
        [
          await this.button("Избранное", "favorites", { fallbackEmoji: "⭐" }),
          await this.button("Тренировка", "training", { fallbackEmoji: "🧠" })
        ],
        [
          await this.button("Раскиды", "grenades", { fallbackEmoji: "💣", style: "success" }),
          await this.button("Настройки", "settings", { fallbackEmoji: "⚙️" })
        ],
        [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendFavorites(ctx: Context) {
    if (!ctx.from?.id) {
      return;
    }
    const favorites = await this.grenades.listFavorites(String(ctx.from.id));
    if (!favorites.length) {
      await ctx.reply("⭐ В избранном пока пусто. Открой раскид и нажми «В избранное».", await this.menuKeyboard());
      return;
    }

    await ctx.reply(
      "⭐ Избранные раскиды",
      Markup.inlineKeyboard([
        ...chunkButtons(
          favorites.slice(0, 18).map((lineup) => this.lineupSelectButton(lineup)),
          1
        ),
        [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async toggleFavorite(ctx: Context, lineupId: string) {
    if (!ctx.from?.id) {
      return;
    }
    await this.touchBotUser(ctx);
    try {
      const result = await this.grenades.toggleFavorite(String(ctx.from.id), lineupId);
      await ctx.reply(result.favorited ? "⭐ Добавлено в избранное." : "Убрано из избранного.", await this.lineupKeyboardById(lineupId));
    } catch (error) {
      await ctx.reply(this.toUserError(error), await this.menuKeyboard());
    }
  }

  private async sendTrainingMaps(ctx: Context) {
    const maps = await this.grenades.listPublishedMaps();
    if (!maps.length) {
      await ctx.reply("Для тренировки пока нет опубликованных раскидов.", await this.menuKeyboard());
      return;
    }
    await ctx.reply(
      "🧠 Выбери карту для тренировки. Я соберу короткий сет из 3-5 раскидов.",
      Markup.inlineKeyboard([
        ...chunkButtons(maps.map((map) => this.mapButton(map, `tr:m:${map.slug}`)), 2),
        [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendTrainingSides(ctx: Context, mapSlug: string) {
    const sides = await this.grenades.listSidesForMap(mapSlug);
    if (!sides.length) {
      await ctx.reply("На этой карте пока нет опубликованных тренировочных раскидов.", await this.grenadeBackToMapsKeyboard());
      return;
    }
    await ctx.reply(
      "Выбери сторону:",
      Markup.inlineKeyboard([
        sides.map((side) => this.simpleButton(sideLabel(side), `tr:s:${mapSlug}:${side}`, { style: "primary" })),
        [await this.button("К выбору карты", "training", { fallbackEmoji: "⬅️" })],
        [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendTrainingSet(ctx: Context, mapSlug: string, side: string) {
    const lineups = await this.grenades.listTrainingSet({ mapSlug, side, limit: 5 });
    if (!lineups.length) {
      await ctx.reply("Не нашёл подходящих раскидов для этой тренировки.", await this.menuKeyboard());
      return;
    }
    await ctx.reply(
      `🧠 Тренировка: ${lineups[0].mapName} · ${sideLabel(side)}\n\nПроходи по списку сверху вниз. После каждого раскида возвращайся сюда или открой следующий.`,
      Markup.inlineKeyboard([
        ...lineups.map((lineup, index) => [this.simpleButton(`${index + 1}. ${lineupButtonLabel(lineup)}`, buildGrenadeCallback({ kind: "position", lineupId: lineup.id }), { style: "success" })]),
        [await this.button("Повторить выбор", "training", { fallbackEmoji: "🔁" }), await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async handleLineupSearch(ctx: Context, query: string) {
    this.setState(ctx, { mode: "idle" });
    const lineups = await this.grenades.searchPublishedLineups(query);
    if (!lineups.length) {
      await ctx.reply("Ничего не нашёл. Попробуй проще: карта + тип + позиция, например `mirage smoke window`.", await this.menuKeyboard());
      return;
    }
    await ctx.reply(
      `🔎 Нашёл раскиды по запросу: ${query}`,
      Markup.inlineKeyboard([
        ...lineups.map((lineup) => [this.lineupSelectButton(lineup)]),
        [await this.button("Новый поиск", "search", { fallbackEmoji: "🔎" }), await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendGrenadeMaps(ctx: Context) {
    const maps = await this.grenades.listPublishedMaps();
    if (!maps.length) {
      await ctx.reply("Пока нет опубликованных раскидов. Добавь их в админке и включи публикацию.", await this.menuKeyboard());
      return;
    }
    await ctx.reply(
      "На какой карте нужен раскид?",
      Markup.inlineKeyboard([
        ...chunkButtons(maps.map((map) => this.mapButton(map, buildGrenadeCallback({ kind: "map", mapSlug: map.slug }))), 2),
        [await this.button("Главное меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendGrenadeSides(ctx: Context, mapSlug: string) {
    const [maps, sides] = await Promise.all([this.grenades.listPublishedMaps(), this.grenades.listSidesForMap(mapSlug)]);
    const map = maps.find((item) => item.slug === mapSlug);
    if (!map || !sides.length) {
      await ctx.reply("Для этой карты пока нет опубликованных раскидов.", await this.grenadeBackToMapsKeyboard());
      return;
    }

    const keyboard = Markup.inlineKeyboard([
      sides.map((side) => this.simpleButton(sideLabel(side), buildGrenadeCallback({ kind: "side", mapSlug, side }), { style: "primary" })),
      [await this.button("Назад к выбору карт", "grenades", { fallbackEmoji: "⬅️" })],
      [await this.button("Главное меню", "menu", { fallbackEmoji: "⌂" })]
    ] as never);
    const text = `Карта: ${map.emoji ? `${map.emoji} ` : ""}${map.name}\nВыбери сторону.`;
    if (map.overviewImageUrl) {
      await ctx.replyWithPhoto(this.publicUrl(map.overviewImageUrl), { caption: text, ...keyboard });
      return;
    }
    await ctx.reply(text, keyboard);
  }

  private async sendGrenadeAreas(ctx: Context, mapSlug: string, side: string) {
    const areas = await this.grenades.listAreas({ mapSlug, side });
    if (!areas.length) {
      await ctx.reply("Для этой стороны пока нет опубликованных раскидов.", await this.grenadeBackToMapsKeyboard());
      return;
    }

    await ctx.reply(
      "Выбери часть карты:",
      Markup.inlineKeyboard([
        ...chunkButtons(
          areas.map((area) =>
            this.simpleButton(area.area, buildGrenadeCallback({ kind: "area", mapSlug, side: normalizeSide(side), areaSlug: area.areaSlug }), { style: "primary" })
          ),
          3
        ),
        [this.simpleButton("Назад", buildGrenadeCallback({ kind: "map", mapSlug }))],
        [await this.button("Главное меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendGrenadeTypes(ctx: Context, mapSlug: string, side: string, areaSlug: string) {
    const types = await this.grenades.listTypesForSelection({ mapSlug, side, areaSlug });
    const buttons = GRENADE_TYPES.filter((type) => types.includes(type.slug)).map((type) =>
      this.simpleButton(type.label, buildGrenadeCallback({ kind: "type", mapSlug, side: normalizeSide(side), areaSlug, grenadeType: type.slug }), {
        fallbackEmoji: grenadeTypeEmoji(type.slug),
        style: type.slug === "smoke" || type.slug === "flash" ? "primary" : "success"
      })
    );
    if (!buttons.length) {
      await ctx.reply("Для этой части карты пока нет опубликованных гранат.", await this.grenadeBackToMapsKeyboard());
      return;
    }

    await ctx.reply(
      "Выбери тип гранаты:",
      Markup.inlineKeyboard([
        ...chunkButtons(buttons, 3),
        [this.simpleButton("Назад", buildGrenadeCallback({ kind: "side", mapSlug, side: normalizeSide(side) }))],
        [await this.button("Главное меню", "menu", { fallbackEmoji: "⌂" })]
      ] as never)
    );
  }

  private async sendLineupPositions(ctx: Context, mapSlug: string, side: string, areaSlug: string, type: string) {
    const lineups = await this.grenades.listLineups({ mapSlug, side, areaSlug, type, published: true });
    if (!lineups.length) {
      await ctx.reply("Не нашёл опубликованных раскидов по этому фильтру.", await this.grenadeBackToMapsKeyboard());
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
        ...chunkButtons(lineups.slice(0, 24).map((lineup) => this.lineupSelectButton(lineup)), 2),
        [this.simpleButton("Назад", buildGrenadeCallback({ kind: "area", mapSlug, side: normalizeSide(side), areaSlug }))],
        [await this.button("К выбору карты", "grenades", { fallbackEmoji: "⬅️" })]
      ] as never)
    );
  }

  private async sendLineup(ctx: Context, id: string) {
    const lineup = await this.grenades.getLineup(id, true);
    if (!lineup) {
      await ctx.reply("Раскид не найден или снят с публикации.", await this.menuKeyboard());
      return;
    }

    const rawCaption = [
      `${lineup.mapEmoji ? `${lineup.mapEmoji} ` : ""}${lineup.mapName} · ${grenadeTypeLabel(lineup.grenadeType)} · ${sideLabel(lineup.side)}`,
      lineup.title,
      "",
      `Откуда: ${lineup.from}`,
      `Куда: ${lineup.to}`,
      `Часть карты: ${lineup.area}`,
      `Сложность: ${difficultyLabel(lineup.difficulty)}`,
      "",
      lineup.description
    ].join("\n");
    const caption = await this.parseCaption(rawCaption);
    const mediaItems = lineup.mediaItems.length
      ? lineup.mediaItems
      : [{ type: lineup.mediaType, url: lineup.mediaUrl, thumbnailUrl: lineup.thumbnailUrl, caption: lineup.title }];
    const media = mediaItems.filter((item) => item.url).slice(0, 10);

    if (!media.length) {
      await ctx.reply(caption.text, { entities: caption.entities as never, ...(await this.lineupKeyboard(lineup)) });
      return;
    }

    if (media.length === 1) {
      const item = media[0];
      try {
        if (item.type === "video") {
          await ctx.replyWithVideo(this.telegramMedia(item.url), { caption: caption.text, caption_entities: caption.entities as never, ...(await this.lineupKeyboard(lineup)) });
        } else if (item.type === "image") {
          await ctx.replyWithPhoto(this.telegramMedia(item.url), { caption: caption.text, caption_entities: caption.entities as never, ...(await this.lineupKeyboard(lineup)) });
        } else {
          await ctx.reply(`${caption.text}\n\n${this.publicUrl(item.url)}`, { entities: caption.entities as never, ...(await this.lineupKeyboard(lineup)) });
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
        caption: index === 0 ? caption.text : item.caption ?? undefined,
        caption_entities: index === 0 ? caption.entities : undefined
      }));

    if (album.length) {
      try {
        await ctx.replyWithMediaGroup(album as never);
        await ctx.reply("Готово. Можешь выбрать ещё одну позицию или вернуться в меню.", await this.lineupKeyboard(lineup));
      } catch {
        await this.replyLineupFallback(ctx, caption, media.map((item) => item.url), lineup);
      }
      return;
    }

    await ctx.reply(`${caption.text}\n\n${media.map((item) => this.publicUrl(item.url)).join("\n")}`, { entities: caption.entities as never, ...(await this.lineupKeyboard(lineup)) });
  }

  private async menuKeyboard() {
    const buttons = await this.getMenuButtons();
    const byKey = new Map(buttons.filter((button) => button.enabled).map((button) => [button.key, button]));
    const rows: TelegramButtonLike[][] = [
      ["stats", "compare"].flatMap((key) => this.configuredButton(byKey, key)),
      ["grenades", "leaderboard"].flatMap((key) => this.configuredButton(byKey, key)),
      ["profile", "favorites"].flatMap((key) => this.configuredButton(byKey, key)),
      ["training", "search"].flatMap((key) => this.configuredButton(byKey, key)),
      ["settings"].flatMap((key) => this.configuredButton(byKey, key))
    ].filter((row) => row.length);
    return Markup.inlineKeyboard(rows as never);
  }

  private async backToMenuKeyboard() {
    return Markup.inlineKeyboard([[await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]] as never);
  }

  private async grenadeBackToMapsKeyboard() {
    return Markup.inlineKeyboard([
      [await this.button("К выбору карты", "grenades", { fallbackEmoji: "⬅️" })],
      [await this.button("Главное меню", "menu", { fallbackEmoji: "⌂" })]
    ] as never);
  }

  private async afterStatsKeyboard(nickname: string, bound: boolean) {
    return Markup.inlineKeyboard([
      [buildUrlButton("Открыть FACEIT", `https://www.faceit.com/ru/players/${encodeURIComponent(nickname)}`, "↗️", null, "primary")],
      [
        await this.button("Другой игрок", "stats:other", { fallbackEmoji: "🔎", style: "primary" }),
        await this.button(bound ? "Сменить ник" : "Привязать ник", "stats:bind", { fallbackEmoji: "🔗" })
      ],
      [await this.button("Меню", "menu", { fallbackEmoji: "⌂" })]
    ] as never);
  }

  private async lineupKeyboard(lineup: LineupKeyboardSource) {
    const rows: TelegramButtonLike[][] = [
      lineup.id ? [await this.button("В избранное", `fav:${lineup.id}`, { fallbackEmoji: "⭐", style: "success" })] : [],
      [
        buildPlainCallbackButton(
          "Назад к позициям",
          buildGrenadeCallback({
            kind: "type",
            mapSlug: lineup.mapSlug,
            side: normalizeSide(lineup.side),
            areaSlug: lineup.areaSlug,
            grenadeType: lineup.grenadeType
          }),
          { fallbackEmoji: "⬅️" }
        )
      ],
      [
        await this.button("К выбору карты", "grenades", { fallbackEmoji: "🗺" }),
        await this.button("Меню", "menu", { fallbackEmoji: "⌂" })
      ]
    ].filter((row) => row.length);
    return Markup.inlineKeyboard(rows as never);
  }

  private async lineupKeyboardById(lineupId: string) {
    const lineup = await this.grenades.getLineup(lineupId, true);
    if (!lineup) {
      return this.menuKeyboard();
    }
    return this.lineupKeyboard(lineup);
  }

  private async button(label: string, callbackData: string, options: { fallbackEmoji?: string; premiumEmojiId?: string | null; style?: BotButtonStyle } = {}) {
    return buildPlainCallbackButton(label, callbackData, options);
  }

  private simpleButton(label: string, callbackData: string, options: { fallbackEmoji?: string; premiumEmojiId?: string | null; style?: BotButtonStyle } = {}) {
    return buildPlainCallbackButton(label, callbackData, options);
  }

  private mapButton(map: { name: string; emoji?: string | null; premiumEmojiId?: string | null; buttonStyle?: string | null }, callbackData: string) {
    return buildPlainCallbackButton(map.name, callbackData, {
      fallbackEmoji: map.emoji ?? "",
      premiumEmojiId: map.premiumEmojiId,
      style: normalizeButtonStyle(map.buttonStyle)
    });
  }

  private lineupSelectButton(lineup: { id: string; from: string; to: string; title: string }) {
    return this.simpleButton(lineupButtonLabel(lineup), buildGrenadeCallback({ kind: "position", lineupId: lineup.id }), { style: "primary" });
  }

  private configuredButton(byKey: Map<string, BotButtonConfig>, key: string): TelegramButtonLike[] {
    const config = byKey.get(key);
    return config ? [buildCallbackButton(config, key)] : [];
  }

  private async getMenuButtons(): Promise<BotButtonConfig[]> {
    const setting = await this.prisma.botSetting.findUnique({ where: { key: "menuButtons" } }).catch(() => null);
    return normalizeMenuButtons(setting?.value);
  }

  private async getPremiumEmojiCatalog(): Promise<PremiumEmojiConfig[]> {
    const setting = await this.prisma.botSetting.findUnique({ where: { key: "premiumEmojiCatalog" } }).catch(() => null);
    return normalizePremiumEmojiCatalog(setting?.value);
  }

  private async parseCaption(text: string): Promise<ParsedEmojiText> {
    return parseEmojiTokens(text, await this.getPremiumEmojiCatalog());
  }

  private setState(ctx: Context, state: BotState) {
    if (ctx.from?.id) {
      this.states.set(ctx.from.id, state);
    }
  }

  private async touchBotUser(ctx: Context) {
    if (!ctx.from?.id) {
      return;
    }
    await this.prisma.botUser
      .upsert({
        where: { telegramId: String(ctx.from.id) },
        update: {
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastSeenAt: new Date()
        },
        create: {
          telegramId: String(ctx.from.id),
          username: ctx.from.username,
          firstName: ctx.from.first_name
        }
      })
      .catch(() => undefined);
  }

  private async getCurrentBotUser(ctx: Context) {
    if (!ctx.from?.id) {
      return null;
    }
    await this.touchBotUser(ctx);
    return this.stats.getBotUser(String(ctx.from.id));
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

  private async replyLineupFallback(ctx: Context, caption: ParsedEmojiText, urls: string[], lineup: LineupKeyboardSource) {
    const links = urls.map((url) => this.publicUrl(url)).join("\n");
    await ctx.reply(`${caption.text}\n\nМедиа не удалось отправить файлом, открой ссылку:\n${links}`, {
      entities: caption.entities as never,
      ...(await this.lineupKeyboard(lineup))
    });
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

  private async sendEmojiIds(ctx: Context) {
    if (!this.isAdmin(ctx)) {
      await ctx.reply("Команда доступна только администраторам.");
      return;
    }

    const message = ctx.message as unknown as {
      entities?: Array<{ type: string; custom_emoji_id?: string }>;
      caption_entities?: Array<{ type: string; custom_emoji_id?: string }>;
    };
    const ids = [...(message.entities ?? []), ...(message.caption_entities ?? [])]
      .filter((entity) => entity.type === "custom_emoji" && entity.custom_emoji_id)
      .map((entity) => entity.custom_emoji_id as string);

    if (!ids.length) {
      await ctx.reply("Не нашёл premium emoji в сообщении. Отправь /emoji_id вместе с emoji из premium-набора.");
      return;
    }

    await ctx.reply(`custom_emoji_id:\n${[...new Set(ids)].join("\n")}`);
  }

  private isAdmin(ctx: Context): boolean {
    const fromId = ctx.from?.id ? String(ctx.from.id) : "";
    const allowed = (this.config.get<string>("ADMIN_TELEGRAM_IDS") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return Boolean(fromId && allowed.includes(fromId));
  }

  private statsCaption(payload: StatCardPayload, bound: boolean): string {
    const prefix = bound ? "Твоя статистика готова" : "Статистика готова";
    return `${prefix}: ${payload.player.nickname} · ELO ${payload.player.elo} · LVL ${payload.player.skillLevel} · K/D ${formatNumber(payload.currentWindow.kd, 2)}`;
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

function grenadeTypeEmoji(type: string): string {
  if (type === "flash") return "⚡";
  if (type === "molotov") return "🔥";
  if (type === "he") return "💥";
  return "💨";
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
  if (normalized.includes("нет данных") || normalized.includes("no cs2") || normalized.includes("cs2")) {
    return "у игрока нет доступных данных CS2 на FACEIT.";
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
  if (normalized.includes("body cannot be empty")) {
    return "пустой запрос отклонён сервером. Обнови страницу админки и попробуй снова.";
  }
  return message || "попробуй позже.";
}

function normalizeButtonStyle(value: string | null | undefined): BotButtonStyle {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  return normalized === "primary" || normalized === "success" || normalized === "danger" ? normalized : "default";
}
