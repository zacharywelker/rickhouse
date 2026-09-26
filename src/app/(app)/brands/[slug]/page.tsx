import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getBrand } from "@/lib/entities/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const [{ slug }, user] = await Promise.all([params, requireSession()]);
  const row = await getBrand(slug, user.id);
  return { title: row?.name ?? "Brand" };
}

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const row = await getBrand(slug, user.id);
  if (!row) notFound();

  return (
    <EntityPage
      kind="Brand"
      name={row.name}
      badges={
        <>
          {row.company ? <Badge>{row.company}</Badge> : null}
          {row.isNdp ? (
            <Badge className="border-primary/40 text-primary">Non-distiller producer</Badge>
          ) : null}
        </>
      }
      meta={[
        { label: "Company", value: row.company ?? "—" },
        { label: "Country", value: row.companyCountry ?? "—" },
        { label: "Sources whiskey", value: row.isNdp ? "Yes" : "No" },
      ]}
      notes={row.notes}
      preset={{ brandIds: [row.id] }}
      searchParams={query}
      emptyMessage="Nothing from this brand on the shelf yet."
    />
  );
}
