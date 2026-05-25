import { PrismaClient } from "@prisma/client";
import { CS2_MAPS } from "@fullfocus/shared";
import { DEFAULT_BOT_BUTTONS, DEFAULT_MENU_BUTTONS, DEFAULT_PREMIUM_EMOJI_CATALOG } from "../src/bot/bot-ui";

const prisma = new PrismaClient();

async function main() {
  await Promise.all(
    CS2_MAPS.map((map, index) =>
      prisma.csMap.upsert({
        where: { slug: map.slug },
        update: { name: map.name, sortOrder: index, active: true },
        create: {
          slug: map.slug,
          name: map.name,
          sortOrder: index,
          active: true,
          emoji: null,
          premiumEmojiId: null,
          buttonStyle: "default"
        }
      })
    )
  );

  await prisma.botSetting.upsert({
    where: { key: "welcomeText" },
    update: {},
    create: {
      key: "welcomeText",
      value: {
        text: "Привет! Я FullFocus cs2: FACEIT-статистика, сравнение игроков, раскиды гранат и персональный CS2-профиль."
      }
    }
  });

  await prisma.botSetting.upsert({
    where: { key: "welcomeImageUrl" },
    update: {},
    create: {
      key: "welcomeImageUrl",
      value: { url: "" }
    }
  });

  await prisma.botSetting.upsert({
    where: { key: "menuButtons" },
    update: {},
    create: {
      key: "menuButtons",
      value: DEFAULT_MENU_BUTTONS
    }
  });

  await prisma.botSetting.upsert({
    where: { key: "botButtons" },
    update: {},
    create: {
      key: "botButtons",
      value: DEFAULT_BOT_BUTTONS
    }
  });

  await prisma.botSetting.upsert({
    where: { key: "premiumEmojiCatalog" },
    update: {},
    create: {
      key: "premiumEmojiCatalog",
      value: DEFAULT_PREMIUM_EMOJI_CATALOG
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
