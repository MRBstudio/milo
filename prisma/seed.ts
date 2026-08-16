import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const items = await Promise.all([
    prisma.menuItem.upsert({
      where: { slug: "the-milan" },
      update: {},
      create: { name: "The Milan", slug: "the-milan", price: 1200000, description: "Cured cuts, stracciatella, pistachio." },
    }),
    prisma.menuItem.upsert({
      where: { slug: "the-garden" },
      update: {},
      create: { name: "The Garden", slug: "the-garden", price: 700000, description: "Whipped ricotta, garden herbs, olive oil." },
    }),
    prisma.menuItem.upsert({
      where: { slug: "the-verde" },
      update: {},
      create: { name: "The Verde", slug: "the-verde", price: 900000, description: "Artichoke, stracciatella, basil." },
    }),
  ]);

  const drop = await prisma.drop.upsert({
    where: { slug: "tehroon" },
    update: {},
    create: {
      name: "TEHROON", slug: "tehroon", location: "Bagh-e Honar",
      startsAt: new Date(Date.now() + 7 * 864e5),
      status: "SCHEDULED", admission: "OPEN",
      storyLine: "The first garden opened. 60 sandwiches found their travelers.",
    },
  });

  for (const m of items) {
    await prisma.dropItem.upsert({
      where: { dropId_menuItemId: { dropId: drop.id, menuItemId: m.id } },
      update: {},
      create: { dropId: drop.id, menuItemId: m.id, capacity: 20, available: 20 },
    });
  }

  console.log("Seeded drop:", drop.slug);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
