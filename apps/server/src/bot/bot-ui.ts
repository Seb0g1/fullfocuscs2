export type BotButtonStyle = "default" | "primary" | "success" | "danger";

export interface BotButtonConfig {
  key: "stats" | "compare" | "grenades" | "leaderboard" | "settings" | "profile" | "favorites" | "training" | "search";
  label: string;
  fallbackEmoji: string;
  premiumEmojiId: string | null;
  style: BotButtonStyle;
  enabled: boolean;
}

export interface PremiumEmojiConfig {
  key: string;
  title: string;
  fallbackEmoji: string;
  customEmojiId: string;
}

export interface TelegramButtonLike {
  text: string;
  callback_data?: string;
  url?: string;
  icon_custom_emoji_id?: string;
  style?: BotButtonStyle;
}

export interface ParsedEmojiText {
  text: string;
  entities: Array<{ type: "custom_emoji"; offset: number; length: number; custom_emoji_id: string }>;
}

export const DEFAULT_MENU_BUTTONS: BotButtonConfig[] = [
  { key: "stats", label: "Статистика", fallbackEmoji: "📈", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "compare", label: "Сравнить", fallbackEmoji: "⚔️", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "grenades", label: "Раскид гранат", fallbackEmoji: "💣", premiumEmojiId: null, style: "success", enabled: true },
  { key: "leaderboard", label: "Лидерборд", fallbackEmoji: "🏆", premiumEmojiId: null, style: "success", enabled: true },
  { key: "profile", label: "Мой профиль", fallbackEmoji: "🎯", premiumEmojiId: null, style: "primary", enabled: true },
  { key: "favorites", label: "Избранное", fallbackEmoji: "⭐", premiumEmojiId: null, style: "default", enabled: true },
  { key: "training", label: "Тренировка", fallbackEmoji: "🧠", premiumEmojiId: null, style: "default", enabled: true },
  { key: "search", label: "Поиск", fallbackEmoji: "🔎", premiumEmojiId: null, style: "default", enabled: true },
  { key: "settings", label: "Настройки", fallbackEmoji: "⚙️", premiumEmojiId: null, style: "primary", enabled: true }
];

export const DEFAULT_PREMIUM_EMOJI_CATALOG: PremiumEmojiConfig[] = [
  { key: "smoke", title: "Смок", fallbackEmoji: "💨", customEmojiId: "" },
  { key: "flash", title: "Флешка", fallbackEmoji: "⚡", customEmojiId: "" },
  { key: "molotov", title: "Молик", fallbackEmoji: "🔥", customEmojiId: "" },
  { key: "he", title: "HE", fallbackEmoji: "💥", customEmojiId: "" },
  { key: "star", title: "Избранное", fallbackEmoji: "⭐", customEmojiId: "" },
  { key: "focus", title: "FullFocus", fallbackEmoji: "🎯", customEmojiId: "" }
];

export function normalizeMenuButtons(value: unknown): BotButtonConfig[] {
  const configured = Array.isArray(value) ? value : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of configured) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      if (typeof record.key === "string") {
        byKey.set(record.key, record);
      }
    }
  }

  return DEFAULT_MENU_BUTTONS.map((fallback) => {
    const item = byKey.get(fallback.key);
    if (!item) {
      return fallback;
    }

    const style = typeof item.style === "string" && isButtonStyle(item.style) ? item.style : fallback.style;
    return {
      key: fallback.key,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : fallback.label,
      fallbackEmoji: typeof item.fallbackEmoji === "string" && item.fallbackEmoji.trim() ? item.fallbackEmoji.trim() : fallback.fallbackEmoji,
      premiumEmojiId: typeof item.premiumEmojiId === "string" && item.premiumEmojiId.trim() ? item.premiumEmojiId.trim() : null,
      style,
      enabled: typeof item.enabled === "boolean" ? item.enabled : fallback.enabled
    };
  });
}

export function normalizePremiumEmojiCatalog(value: unknown): PremiumEmojiConfig[] {
  const configured = Array.isArray(value) ? value : [];
  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of configured) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      if (typeof record.key === "string") {
        byKey.set(record.key, record);
      }
    }
  }

  const defaults = DEFAULT_PREMIUM_EMOJI_CATALOG.map((fallback) => {
    const item = byKey.get(fallback.key);
    if (!item) {
      return fallback;
    }
    return {
      key: fallback.key,
      title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : fallback.title,
      fallbackEmoji: typeof item.fallbackEmoji === "string" && item.fallbackEmoji.trim() ? item.fallbackEmoji.trim() : fallback.fallbackEmoji,
      customEmojiId: typeof item.customEmojiId === "string" ? item.customEmojiId.trim() : fallback.customEmojiId
    };
  });

  const custom = configured.flatMap((item): PremiumEmojiConfig[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const key = typeof record.key === "string" ? record.key.trim() : "";
    if (!key || DEFAULT_PREMIUM_EMOJI_CATALOG.some((entry) => entry.key === key)) {
      return [];
    }
    return [{
      key,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : key,
      fallbackEmoji: typeof record.fallbackEmoji === "string" && record.fallbackEmoji.trim() ? record.fallbackEmoji.trim() : "✨",
      customEmojiId: typeof record.customEmojiId === "string" ? record.customEmojiId.trim() : ""
    }];
  });

  return [...defaults, ...custom];
}

export function buildCallbackButton(config: BotButtonConfig, callbackData: string): TelegramButtonLike {
  return withStyleAndIcon({
    text: config.premiumEmojiId ? config.label : `${config.fallbackEmoji} ${config.label}`.trim(),
    callback_data: callbackData
  }, config.premiumEmojiId, config.style);
}

export function buildUrlButton(label: string, url: string, fallbackEmoji = "", premiumEmojiId?: string | null, style: BotButtonStyle = "default"): TelegramButtonLike {
  return withStyleAndIcon({
    text: premiumEmojiId ? label : `${fallbackEmoji} ${label}`.trim(),
    url
  }, premiumEmojiId, style);
}

export function buildPlainCallbackButton(
  label: string,
  callbackData: string,
  options: { fallbackEmoji?: string; premiumEmojiId?: string | null; style?: BotButtonStyle } = {}
): TelegramButtonLike {
  return withStyleAndIcon({
    text: options.premiumEmojiId ? label : `${options.fallbackEmoji ?? ""} ${label}`.trim(),
    callback_data: callbackData
  }, options.premiumEmojiId, options.style ?? "default");
}

export function parseEmojiTokens(source: string, catalog: PremiumEmojiConfig[]): ParsedEmojiText {
  const byKey = new Map(catalog.map((item) => [item.key, item]));
  const entities: ParsedEmojiText["entities"] = [];
  let text = "";
  let lastIndex = 0;
  const regex = /\{\{emoji:([a-z0-9_-]+)\}\}/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source))) {
    const token = byKey.get(match[1]);
    text += source.slice(lastIndex, match.index);
    if (token) {
      const offset = text.length;
      const emoji = token.fallbackEmoji || "✨";
      text += emoji;
      if (token.customEmojiId) {
        entities.push({
          type: "custom_emoji",
          offset,
          length: emoji.length,
          custom_emoji_id: token.customEmojiId
        });
      }
    } else {
      text += match[0];
    }
    lastIndex = regex.lastIndex;
  }

  text += source.slice(lastIndex);
  return { text, entities };
}

function withStyleAndIcon(button: TelegramButtonLike, premiumEmojiId?: string | null, style: BotButtonStyle = "default"): TelegramButtonLike {
  const result = { ...button };
  if (premiumEmojiId) {
    result.icon_custom_emoji_id = premiumEmojiId;
  }
  if (style !== "default") {
    result.style = style;
  }
  return result;
}

function isButtonStyle(value: string): value is BotButtonStyle {
  return value === "default" || value === "primary" || value === "success" || value === "danger";
}
