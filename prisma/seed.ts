import { ensureSeeded, prisma } from "../src/core/db";

async function main() {
  console.log("Seeding Resume Sync SQLite database...");
  await ensureSeeded();
  const platforms = await prisma.platform.findMany({ orderBy: { sortOrder: "asc" } });
  console.log(
    `Seeded ${platforms.length} platforms:`,
    platforms.map((p) => `${p.name} (${p.id})`).join(", ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
