import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { spinBottle } from "@/lib/bottles/roulette";

export const dynamic = "force-dynamic";

function idList(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  return [...seen].slice(0, 50);
}

function proofBound(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(0, n));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  await requireSession();
  const params = request.nextUrl.searchParams;

  const bottle = await spinBottle({
    categoryIds: idList(params.get("category")),
    finishIds: idList(params.get("finish")),
    proof: { min: proofBound(params.get("proofMin")), max: proofBound(params.get("proofMax")) },
  });

  return NextResponse.json({ bottle });
}
