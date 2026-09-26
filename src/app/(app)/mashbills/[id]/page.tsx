import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getMashbill } from "@/lib/entities/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireSession()]);
  const row = Number.isInteger(Number(id)) ? await getMashbill(Number(id), user.id) : null;
  return { title: row ? (row.name ?? row.recipe) : "Mashbill" };
}

export default async function MashbillPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const mashbillId = Number(id);
  if (!Number.isInteger(mashbillId)) notFound();

  const row = await getMashbill(mashbillId, user.id);
  if (!row) notFound();

  return (
    <EntityPage
      kind="Mashbill"
      name={row.name ?? row.recipe}
      meta={[{ label: "Recipe", value: row.recipe }]}
      notes={row.notes}
      preset={{ mashbillIds: [mashbillId] }}
      searchParams={query}
      emptyMessage="Nothing on the shelf uses this recipe yet."
    />
  );
}
