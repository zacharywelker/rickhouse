import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

/**
 * Public (see middleware PUBLIC_PATHS) so Unraid/Docker health checks can
 * reach it without a session. It reports connectivity only — never data.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", database: "up" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json({ status: "error", database: "down", message }, { status: 503 });
  }
}
