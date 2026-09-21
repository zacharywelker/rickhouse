import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://rickhouse:rickhouse@localhost:5432/rickhouse",
  },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
