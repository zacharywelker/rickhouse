import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getStore } from "@/lib/entities/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, user] = await Promise.all([params, requireSession()]);
  const row = await getStore(slug, user.id);
  return { title: row?.name ?? "Store" };
}

export default async function StorePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const row = await getStore(slug, user.id);
  if (!row) notFound();

  return (
    <EntityPage
      kind="Store"
      name={row.name}
      badges={row.isOnline ? <Badge className="border-primary/40 text-primary">Online</Badge> : null}
      meta={[
        { label: "Location", value: row.location ?? "—" },
        {
          label: "Website",
          value: row.url ? (
            <a href={row.url} className="text-primary hover:underline" rel="noreferrer noopener" target="_blank">
              Visit
            </a>
          ) : (
            "—"
          ),
        },
      ]}
      notes={row.notes}
      preset={{ storeIds: [row.id] }}
      searchParams={query}
      emptyMessage="Nothing bought here yet."
    />
  );
}
