import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EntityPage } from "@/components/entities/entity-page";
import { requireSession } from "@/lib/auth";
import { getAlsoUsedAs, getIngredient } from "@/lib/entities/queries";
import { INGREDIENT_KIND_LABELS } from "@/lib/expressions/ingredient-rules";
import { humanise } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, user] = await Promise.all([params, requireSession()]);
  const row = Number.isInteger(Number(id)) ? await getIngredient(Number(id), user.id) : null;
  return { title: row?.name ?? "Ingredient" };
}

export default async function IngredientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, user] = await Promise.all([params, searchParams, requireSession()]);
  const ingredientId = Number(id);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const row = await getIngredient(ingredientId, user.id);
  if (!row) notFound();
  const also = await getAlsoUsedAs(row, user.id);

  return (
    <EntityPage
      kind="Ingredient"
      name={row.name}
      badges={
        <>
          <Badge>{INGREDIENT_KIND_LABELS[row.kind]}</Badge>
          {row.family ? <Badge>{humanise(row.family)}</Badge> : null}
        </>
      }
      extra={
        also.length > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Also used as{" "}
            {also.map((item, index) => (
              <Fragment key={item.id}>
                {index > 0 ? " · " : null}
                <Link href={`/ingredients/${item.id}` as Route} className="text-primary underline-offset-2 hover:underline">
                  {INGREDIENT_KIND_LABELS[item.kind]}
                </Link>{" "}
                ({item.bottles} {item.bottles === 1 ? "bottle" : "bottles"})
              </Fragment>
            ))}
          </p>
        ) : null
      }
      preset={{ ingredientIds: [ingredientId] }}
      searchParams={query}
      emptyMessage="No bottles on the shelf use this yet."
    />
  );
}
