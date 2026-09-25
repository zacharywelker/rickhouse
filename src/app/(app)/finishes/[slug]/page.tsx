import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getFinish } from "@/lib/entities/queries";
import { humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, user] = await Promise.all([params, requireSession()]);
  const row = await getFinish(slug, user.id);
  return { title: row?.name ?? "Finish" };
}

export default async function FinishPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const row = await getFinish(slug, user.id);
  if (!row) notFound();

  return (
    <EntityPage
      kind="Finish"
      name={row.name}
      badges={<Badge>{humanise(row.finishType)}</Badge>}
      meta={[{ label: "Type", value: humanise(row.finishType) }]}
      notes={row.notes}
      preset={{ finishIds: [row.id] }}
      searchParams={query}
      emptyMessage="Nothing finished this way on the shelf yet."
    />
  );
}
