import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { getDistillery } from "@/lib/entities/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const row = await getDistillery(slug);
  return { title: row?.name ?? "Distillery" };
}

export default async function DistilleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const row = await getDistillery(slug);
  if (!row) notFound();

  const where = [row.city, row.state, row.country].filter(Boolean).join(", ");

  return (
    <EntityPage
      kind="Distillery"
      name={row.name}
      badges={row.company ? <Badge>{row.company}</Badge> : null}
      meta={[
        { label: "Location", value: where || "—" },
        { label: "DSP", value: row.dspNumber ?? "—" },
        { label: "Founded", value: row.founded ?? "—" },
        { label: "Owner", value: row.company ?? "—" },
      ]}
      notes={row.notes}
      preset={{ distilleryIds: [row.id] }}
      searchParams={query}
      emptyMessage="No bottles in your collection were made here yet. Blends count — a bottle appears here if this distillery contributed any part of it."
    />
  );
}
