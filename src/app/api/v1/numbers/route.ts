import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";
import { getCurrency } from "@/lib/preferences";
import { buildNumbers, type Finding } from "@/lib/dashboard/findings";
import { acquiring, money, shelf, stockpile } from "@/lib/dashboard/numbers";

export const dynamic = "force-dynamic";

/**
 * The web Numbers page's findings, from the same queries and sentences: a lead and four chapters, each finding a
 * figure and a sentence. A finding points at the bottles it counts as `bottles` (the web grid's query string,
 * which `GET /api/v1/bottles` takes as is) or, when it names one bottle, as `bottleId`. Amounts are in the
 * account's currency. Charts stay on the web.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");

  const [stock, spend, arrivals, onShelf, currency] = await Promise.all([
    stockpile(user.id),
    money(user.id),
    acquiring(user.id),
    shelf(user.id),
    getCurrency(),
  ]);
  const { lead, chapters } = buildNumbers({
    currency,
    // The server's own calendar day, as the web page uses.
    today: new Date().toLocaleDateString("en-CA"),
    stockpile: stock,
    money: spend,
    acquiring: arrivals,
    shelf: onShelf,
  });

  return NextResponse.json({
    empty: !lead && stock.onShelf === 0 && spend.acquired === 0,
    lead: lead && finding(lead),
    chapters: chapters.map((c) => ({
      id: c.id,
      number: c.number,
      title: c.title,
      coverage: c.coverage,
      thin: c.thin,
      findings: c.findings.map(finding),
    })),
  });
}

function finding(f: Finding) {
  const one = /^\/bottles\/(\d+)$/.exec(f.href);
  return {
    id: f.id,
    figure: f.figure,
    sentence: f.sentence,
    bottleId: one ? Number(one[1]) : null,
    bottles: one ? null : f.href.split("?")[1] ?? "",
  };
}
