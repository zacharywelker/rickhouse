import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { REFERENCE_OPTION_LOADERS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";
import { auditLines, auditNote, parseRankingParams, rankingEmpty, rankingSections, type RankingView } from "@/lib/tournaments/ranking-model";
import { rankingFor } from "@/lib/tournaments/ranking-query";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ranking and audit" };
export const dynamic = "force-dynamic";

const LIST = "/tournaments" as Route;
const href = (view: RankingView, categoryId: number | null) => {
  const q = new URLSearchParams();
  if (view === "audit") q.set("view", "audit");
  if (categoryId !== null) q.set("categoryId", String(categoryId));
  return `/tournaments/ranking${q.size > 0 ? `?${q}` : ""}` as Route;
};

export default async function RankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSession();
  const { categoryId, view } = parseRankingParams(await searchParams);
  const [categories, result] = await Promise.all([REFERENCE_OPTION_LOADERS.categories(user.id), rankingFor(user.id, categoryId)]);
  const sections = rankingSections(result);
  const lines = auditLines(result);
  const empty = rankingEmpty(result);
  const note = auditNote(result);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={LIST} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Tournaments
        </Link>
        <h1 className="text-3xl text-accent">Ranking and audit</h1>
        <p className="text-sm text-muted-foreground">
          {result.competitors.length === 0 ? "Every finished flight of every tournament, pooled." : `${result.competitors.length} ranked from every finished flight of every tournament.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="View" className="inline-flex border border-border">
          {(["ranking", "audit"] as const).map((v, i) => (
            <Link
              key={v}
              href={href(v, categoryId)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 min-w-11 items-center px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                i > 0 && "border-l border-border",
                view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {v === "ranking" ? "Ranking" : "Audit"}
            </Link>
          ))}
        </nav>
        <form method="get" action="/tournaments/ranking" className="flex items-center gap-2">
          {view === "audit" ? <input type="hidden" name="view" value="audit" /> : null}
          <label htmlFor="category" className="text-sm text-muted-foreground">
            Category
          </label>
          <select
            id="category"
            name="categoryId"
            defaultValue={categoryId === null ? "" : String(categoryId)}
            className="min-h-11 border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All</option>
            {categories.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="min-h-11">
            Show
          </Button>
        </form>
      </div>

      {empty === "no-flights" ? (
        <div className="flex flex-col items-start gap-3 border-t border-border pt-6">
          <p>{categoryId === null ? "No decided flights yet. Play a tournament to build a ranking." : "No decided flights in this category yet."}</p>
          <Button className="min-h-11" asChild>
            <Link href={LIST}>Tournaments</Link>
          </Button>
        </div>
      ) : view === "ranking" ? (
        <div className="flex flex-col gap-8">
          {sections.map((section) => (
            <section key={section.title ?? "all"} aria-label={section.title ?? "Ranking"} className="flex flex-col gap-2">
              {section.title ? (
                <div>
                  <h2 className="text-lg">
                    {section.title} <span className="text-sm text-muted-foreground">· {section.size} ranked</span>
                  </h2>
                  {section.note ? <p className="text-sm text-muted-foreground">{section.note}</p> : null}
                </div>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-20">Rank</TableHead>
                    <TableHead>Bottle</TableHead>
                    <TableHead className="text-right">Flights</TableHead>
                    <TableHead className="text-right">Rated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{row.rankText}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                          {row.href ? (
                            <Link href={row.href as Route} className="underline-offset-4 hover:underline">
                              {row.name}
                            </Link>
                          ) : (
                            <span>{row.name}</span>
                          )}
                          {row.tags.length > 0 ? (
                            <span className="flex flex-wrap gap-1">
                              {row.tags.map((t) => (
                                <Badge key={t}>{t}</Badge>
                              ))}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.heats}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.rating ?? "–"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </div>
      ) : (
        <section aria-label="Audit" className="flex flex-col gap-3">
          <h2 className="text-lg">Where the ranking disagrees with your ratings</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Nothing here changes a rating. A bottle is compared only with others it can be compared to, and one that has only met its own proof band is never compared across bands.
          </p>
          {empty === "no-ratings" ? (
            <p className="border-t border-border pt-4">Log tastings with ratings to see where your ranking disagrees.</p>
          ) : empty === "no-gaps" ? (
            <p className="border-t border-border pt-4">Your ranking and your ratings agree wherever they can be compared.</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{line.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{line.text}</span>
                    <span className="text-sm text-muted-foreground">{line.verdict}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">
                    <span aria-hidden>
                      {line.direction === "lower" ? "▼" : "▲"} {line.gap}
                    </span>
                    <span className="sr-only">
                      {line.gap} places {line.direction}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
        </section>
      )}
    </div>
  );
}
