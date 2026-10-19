import { type NextRequest, type NextResponse } from "next/server";
import { authed, isHalt, json } from "@/lib/tournaments/http";
import { fieldCandidates } from "@/lib/tournaments/field";
import { parseFieldFilters } from "@/lib/tournaments/field-filters";

export const dynamic = "force-dynamic";

/**
 * Your bottles to pick a field from: `q` (words that must all appear), `categoryIds` and `statuses` (comma lists;
 * `statuses=all` is every status, absent is owned and open), `opened` (`any|open|sealed`) and `tasted` (`any|tasted|untasted`).
 * Junk values are ignored and fall back to the default, never an error. `rows` is capped at 500; `total` counts all matches.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authed();
  if (isHalt(auth)) return auth.response;
  const params = request.nextUrl.searchParams;
  const raw = Object.fromEntries(["q", "categoryIds", "statuses", "opened", "tasted"].flatMap((key) => (params.has(key) ? [[key, params.get(key)]] : [])));
  return json(await fieldCandidates(auth.userId, parseFieldFilters(raw)));
}
