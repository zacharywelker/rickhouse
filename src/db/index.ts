import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * One connection pool per process. Next.js dev reloads modules on every edit,
 * so the client is stashed on `globalThis` to avoid leaking pools.
 */
const globalForDb = globalThis as unknown as {
  __rickhouseSql?: ReturnType<typeof postgres>;
};

function client() {
  if (!globalForDb.__rickhouseSql) {
    globalForDb.__rickhouseSql = postgres(env().DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
      // Keep money and other numerics as strings; JS floats lose cents.
      transform: undefined,
    });
  }
  return globalForDb.__rickhouseSql;
}

export const db = drizzle(client(), { schema, casing: "snake_case" });
export { schema };
