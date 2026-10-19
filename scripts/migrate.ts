import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required (the embedded PGlite database migrates itself on startup).");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
await migrate(drizzle({ client }), { migrationsFolder: "drizzle" });
await client.end();
console.log("Migrations applied.");
