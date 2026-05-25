import { describe, expect, it } from "vitest";
import { buildCallbackButton, normalizeMenuButtons, parseEmojiTokens } from "./bot-ui";

describe("bot-ui helpers", () => {
  it("keeps premium emoji and Telegram button style in raw button objects", () => {
    const [buttonConfig] = normalizeMenuButtons([
      {
        key: "stats",
        label: "Стата",
        fallbackEmoji: "📈",
        premiumEmojiId: "5368324170671202286",
        style: "primary",
        enabled: true
      }
    ]);

    expect(buildCallbackButton(buttonConfig, "stats")).toEqual({
      text: "Стата",
      callback_data: "stats",
      icon_custom_emoji_id: "5368324170671202286",
      style: "primary"
    });
  });

  it("falls back to text emoji when no premium emoji id is configured", () => {
    const [buttonConfig] = normalizeMenuButtons([{ key: "stats", label: "Статистика", fallbackEmoji: "📈" }]);

    expect(buildCallbackButton(buttonConfig, "stats")).toMatchObject({
      text: "📈 Статистика",
      callback_data: "stats"
    });
  });

  it("turns description emoji tokens into plain text and custom emoji entities", () => {
    const parsed = parseEmojiTokens("Кинь {{emoji:smoke}} в окно", [
      { key: "smoke", title: "Смок", fallbackEmoji: "💨", customEmojiId: "custom-smoke" }
    ]);

    expect(parsed.text).toBe("Кинь 💨 в окно");
    expect(parsed.entities).toEqual([
      {
        type: "custom_emoji",
        offset: "Кинь ".length,
        length: "💨".length,
        custom_emoji_id: "custom-smoke"
      }
    ]);
  });
});
