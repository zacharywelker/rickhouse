import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError, readJsonObject } from "@/lib/api/v1";
import { CURRENCIES, CURRENCY_CODES, currencyDecimals } from "@/lib/currency";
import { getPreferences, updatePreferences } from "@/lib/preferences";

export const dynamic = "force-dynamic";

/** What the account's currency is and what it may be, so the phone offers the same list as the web. */
function answer(currency: string) {
  return {
    currency,
    currencies: CURRENCIES.map((c) => ({ code: c.code, name: c.name, symbol: c.symbol.trim(), decimals: currencyDecimals(c.code) })),
  };
}

/** The account's currency (display only: amounts are never converted) and the currencies it may pick. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  return NextResponse.json(answer((await getPreferences(user.id)).currency));
}

/** Changes the currency; the web's Preferences page shows the same setting. */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  const read = await readJsonObject(request);
  if ("error" in read) return read.error;
  const currency = read.body.currency;
  if (typeof currency !== "string" || !CURRENCY_CODES.includes(currency)) {
    return apiError(422, "invalid", "That is not a currency we offer.", { currency: "Pick one from the list." });
  }
  await updatePreferences(user.id, { currency });
  return NextResponse.json(answer(currency));
}
