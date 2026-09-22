import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { exportBottlesCsv } from "@/lib/bottles/transfer";

/** Behind the session like every other route: this is the whole collection. */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  await requireSession();
  const csv = await exportBottlesCsv();
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rickhouse-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
