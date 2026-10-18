import { type NextRequest, type NextResponse } from "next/server";
import { authed, isHalt, json } from "@/lib/tournaments/http";
import { labelCandidates } from "@/lib/tournaments/field";

export const dynamic = "force-dynamic";

/** Your labels (not bottles) whose brand or name has every word of `q`, for adding a label with no bottle. A blank `q` lists the first 30. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const q = (request.nextUrl.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return json({ rows: await labelCandidates(auth.userId, q) });
}
