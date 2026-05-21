import { PrismaClient } from "@prisma/client";
import { CS2_MAPS } from "@fullfocus/shared";

const prisma = new PrismaClient();

async function main() {
  await Promise.all(
    CS2_MAPS.map((map, index) =>
      prisma.csMap.upsert({
        where: { slug: map.slug },
        update: { name: map.name, sortOrder: index, active: true },
        create: { slug: map.slug, name: map.name, sortOrder: index, active: true }
      })
    )
  );

  await prisma.botSetting.upsert({
    where: { key: "welcomeText" },
    update: {},
    create: {
      key: "welcomeText",
      value: {
        text: "Привет! Я FullFocus cs2: FACEIT статистика, сравнение игроков и раскиды гранат."
      }
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
