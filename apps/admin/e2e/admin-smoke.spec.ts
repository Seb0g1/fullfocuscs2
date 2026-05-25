import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";

let apiServer: Server;

test.beforeAll(async () => {
  apiServer = await startMockApi();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

test("login and dashboard render with mocked production data", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Контроль бота, статистики FACEIT и раскидов в одном месте." })).toBeVisible();
  await page.getByRole("button", { name: "Войти в dev-режиме" }).click();
  await expect(page.getByRole("heading", { name: "Панель управления" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Seb0g1" }).first()).toBeVisible();
  await expect(page.getByText("Не найден")).toBeVisible();
});

test("grenade admin uses dark custom controls and empty state", async ({ page }) => {
  await page.goto("/grenades");
  await expect(page.getByRole("heading", { name: "Раскиды гранат" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Mirage" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "Inferno" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("grenade-video-upload").setInputFiles({
    name: "lineup.webm",
    mimeType: "video/webm",
    buffer: Buffer.from("mock-video")
  });
  await expect(page.getByText("Видео-редактор FullFocus")).toBeVisible();
  await page.getByRole("textbox", { name: "Время полёта, сек" }).fill("2.4");
  await page.getByRole("textbox", { name: "Стоп-кадр, сек" }).fill("1.2");
  await page.getByRole("textbox", { name: "Zoom видео" }).fill("1.25");
  await page.getByRole("textbox", { name: "Сдвиг X" }).fill("40");
  await page.getByRole("textbox", { name: "Сдвиг Y" }).fill("-80");
  await page.getByRole("textbox", { name: "Стоп-кадр длится, сек" }).fill("1.6");
  await page.getByRole("button", { name: "Собрать MP4 для Telegram" }).click();
  await expect(page.getByText("Видео собрано")).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть готовый MP4" })).toBeVisible();
  await expect(page.getByText("FullFocus MP4 · полёт 2.4 сек.")).toBeVisible();
  await expect(page.getByText("Каталог пуст")).toBeVisible();
});

test("users and settings pages expose production controls", async ({ page }) => {
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Администраторы" })).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  await expect(page.getByText("@Seb0g1")).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.getByLabel("Приветственное сообщение")).toBeVisible();
  await expect(page.getByLabel("Картинка приветствия")).toBeVisible();
  await expect(page.getByText("https://tiktok.sebog1.ru", { exact: true })).toBeVisible();

  const settingsPatchPaths: string[] = [];
  const settingsPatchBodies: Array<{ settings?: Array<{ key: string; value: unknown }> }> = [];
  let mediaUploads = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && url.pathname === "/api/admin/media") {
      mediaUploads += 1;
    }
    if (request.method() === "PATCH" && url.pathname.startsWith("/api/admin/settings")) {
      settingsPatchPaths.push(url.pathname);
      const body = request.postData();
      if (body) {
        settingsPatchBodies.push(JSON.parse(body));
      }
    }
  });

  await page.getByTestId("welcome-image-upload").setInputFiles({
    name: "welcome.webp",
    mimeType: "image/webp",
    buffer: Buffer.from("mock-image")
  });
  await expect(page.getByText("Картинка загружена.")).toBeVisible();
  await expect(page.getByLabel("Картинка приветствия")).toHaveValue("/media/welcome-upload.webp");
  await expect(page.getByRole("img", { name: "Preview приветствия" })).toHaveAttribute("src", /welcome-upload\.webp/);

  await page.getByRole("button", { name: "Сохранить всё" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();
  expect(mediaUploads).toBe(1);
  expect(settingsPatchPaths).toEqual(["/api/admin/settings"]);
  expect(settingsPatchBodies[0]?.settings?.find((item) => item.key === "welcomeImageUrl")).toEqual({
    key: "welcomeImageUrl",
    value: { url: "/media/welcome-upload.webp" }
  });
});

function startMockApi(): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1:4567");
    if (request.method === "OPTIONS") {
      return json(request, response, {});
    }
    if (url.pathname === "/api/admin/auth/me" || url.pathname === "/api/admin/auth/dev") {
      return json(request, response, { id: "admin", telegramId: "962443492", username: "Seb0g1", firstName: "Даниил", role: "owner", createdAt: new Date(0).toISOString() });
    }
    if (url.pathname === "/api/admin/overview") {
      return json(request, response, {
        users: 14,
        admins: 1,
        maps: 2,
        lineups: 0,
        publishedLineups: 0,
        recentQueries: [
          { id: "q1", query: "Seb0g1", faceitNickname: "Seb0g1", status: "ok", createdAt: new Date(0).toISOString() },
          { id: "q2", query: "missing", faceitNickname: null, status: "error:404", createdAt: new Date(0).toISOString() }
        ]
      });
    }
    if (url.pathname === "/api/admin/maps") {
      return json(request, response, [
        { id: "mirage", slug: "mirage", name: "Mirage", active: true, overviewImageUrl: null, _count: { lineups: 0 } },
        { id: "inferno", slug: "inferno", name: "Inferno", active: true, overviewImageUrl: null, _count: { lineups: 0 } }
      ]);
    }
    if (url.pathname === "/api/admin/grenades") {
      return json(request, response, []);
    }
    if (request.method === "POST" && url.pathname === "/api/admin/media/grenade-video") {
      return json(request, response, {
        mediaItem: {
          type: "video",
          url: "/media/processed.mp4",
          thumbnailUrl: "/media/poster.jpg",
          caption: "lineup.webm",
          flightSeconds: 2.4,
          aimFrameSeconds: 1.2,
          videoScale: 1.25,
          videoOffsetX: 40,
          videoOffsetY: -80,
          introSeconds: 1.6,
          adapted: true
        },
        source: { filename: "lineup.webm", durationSeconds: 5.2, width: 1080, height: 1920 },
        editor: {
          flightSeconds: 2.4,
          aimFrameSeconds: 1.2,
          videoScale: 1.25,
          videoOffsetX: 40,
          videoOffsetY: -80,
          introSeconds: 1.6
        }
      });
    }
    if (request.method === "POST" && url.pathname === "/api/admin/media") {
      return json(request, response, { url: "/media/welcome-upload.webp", filename: "welcome-upload.webp", mimetype: "image/webp" });
    }
    if (url.pathname === "/api/admin/users") {
      return json(request, response, [{ id: "admin", telegramId: "962443492", username: "Seb0g1", firstName: "Даниил", role: "owner", createdAt: new Date(0).toISOString() }]);
    }
    if (url.pathname === "/api/admin/settings") {
      return json(request, response, [
        { key: "welcomeText", value: { text: "Привет! Я FullFocus cs2." } },
        { key: "welcomeImageUrl", value: { url: "" } }
      ]);
    }
    if (url.pathname === "/api/admin/settings/runtime") {
      return json(request, response, {
        adminPublicUrl: "https://tiktok.sebog1.ru",
        botWebhookUrl: "https://tiktok.sebog1.ru/api/telegram/webhook",
        telegramBotUsername: "fullfocuscs2_bot",
        dockerNginxPort: "18080",
        nodeEnv: "production",
        adminDevLogin: false
      });
    }
    return json(request, response, { ok: true });
  });

  return new Promise((resolve) => {
    server.listen(4567, "127.0.0.1", () => resolve(server));
  });
}

function json(request: { headers: { origin?: string } }, response: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }, body: unknown, status = 200) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": request.headers.origin ?? "http://127.0.0.1:5030",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(JSON.stringify(body));
}
