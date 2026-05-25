import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminController } from "./admin.controller";

describe("AdminController settings", () => {
  it("saves multiple bot settings in one transaction", async () => {
    const upsert = vi.fn((args) => args);
    const transaction = vi.fn(async (operations) => operations);
    const controller = new AdminController(
      {} as never,
      {
        botSetting: {
          upsert
        },
        $transaction: transaction
      } as never,
      {} as never
    );

    const result = await controller.updateSettings({
      settings: [
        { key: "welcomeText", value: { text: "Привет" } },
        { key: "menuButtons", value: [{ key: "stats", label: "Статистика" }] }
      ]
    });

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      expect.objectContaining({ where: { key: "welcomeText" } }),
      expect.objectContaining({ where: { key: "menuButtons" } })
    ]);
  });

  it("rejects unsupported bot setting keys", async () => {
    const controller = new AdminController({} as never, {} as never, {} as never);

    await expect(controller.updateSettings({ settings: [{ key: "rawSql", value: true }] })).rejects.toBeInstanceOf(HttpException);
  });

  it("keeps legacy single setting endpoint compatible", async () => {
    const upsert = vi.fn(async (args) => args);
    const controller = new AdminController(
      {} as never,
      {
        botSetting: {
          upsert
        }
      } as never,
      {} as never
    );

    await controller.updateSetting("welcomeImageUrl", { value: { url: "/media/welcome.webp" } });

    expect(upsert).toHaveBeenCalledWith({
      where: { key: "welcomeImageUrl" },
      update: { value: { url: "/media/welcome.webp" } },
      create: { key: "welcomeImageUrl", value: { url: "/media/welcome.webp" } }
    });
  });
});
