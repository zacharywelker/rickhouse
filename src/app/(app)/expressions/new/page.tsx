import type { Metadata } from "next";
import { ExpressionForm } from "@/components/expressions/expression-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { expressionFormData } from "@/lib/expressions/form-data";
import { requireSession } from "@/lib/auth";
import { prefillFromCola } from "@/lib/cola/prefill";
import { registryCase } from "@/lib/cola/map";

export const metadata: Metadata = { title: "New Label" };
export const dynamic = "force-dynamic";

export default async function NewExpressionPage({ searchParams }: { searchParams: Promise<{ ttb?: string | string[] }> }) {
  const user = await requireSession();
  const { options, categoryGroups, links } = await expressionFormData(null, user.id);

  const requested = (await searchParams).ttb;
  const ttbInput = typeof requested === "string" ? requested : "";
  const prefill = ttbInput ? await prefillFromCola(ttbInput, options.brandId ?? []) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">New Label</h1>
      </div>

      {/* A plain GET form: the lookup runs on the server as the page renders. */}
      <form method="get" className="flex max-w-2xl flex-col gap-1.5">
        <Label htmlFor="start-from-ttb">Start from a TTB ID</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="start-from-ttb"
            name="ttb"
            defaultValue={ttbInput}
            inputMode="numeric"
            autoComplete="off"
            placeholder="21132001000620, or the registry link"
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            Look up
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Optional. Fills in the brand, name and category from TTB&rsquo;s label approval, and attaches it with its
          label images once you create the label.
        </p>
        {prefill && !prefill.ok ? (
          <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {prefill.error}
          </p>
        ) : null}
        {prefill?.ok ? (
          <p role="status" className="border border-border bg-muted px-3 py-2 text-sm">
            Found {prefill.ttbId}: {prefill.summary.brand} {prefill.summary.name}
            {prefill.summary.classType ? `, ${registryCase(prefill.summary.classType)}` : ""}
            {prefill.summary.applicant ? ` from ${prefill.summary.applicant}` : ""}.{" "}
            {prefill.missingBrand
              ? `There is no brand called ${prefill.missingBrand} yet; create it in the Brand picker below.`
              : "Check the fields below before creating the label."}
          </p>
        ) : null}
      </form>

      <ExpressionForm
        // A new lookup starts the form over rather than merging into what was typed.
        key={prefill?.ttbId ?? "blank"}
        expressionId={null}
        initialValues={prefill?.ok ? prefill.values : null}
        initialLinks={links}
        options={options}
        categoryGroups={categoryGroups}
        ttbId={prefill?.ttbId ?? null}
      />
    </div>
  );
}
