import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Section, SectionContent } from "@/components/ui/section";
import { RESOURCES, RESOURCE_KEYS } from "@/lib/admin/registry";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Configuration" };
export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const user = await requireSession();
  const counts = await Promise.all(
    RESOURCE_KEYS.map(async (key) => ({ key, count: (await RESOURCES[key].list(user.id)).length })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Configuration</h1>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map(({ key, count }) => {
          const config = RESOURCES[key];
          return (
            <Link key={key} href={`/admin/${key}` as Route} className="group">
              <Section className="h-full transition-colors group-hover:border-primary">
                <SectionContent className="flex h-full flex-col gap-2 pb-4 pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg">{config.label}</h2>
                    <span className="text-2xl tabular-nums text-accent">{count}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Manage
                    <ArrowRight className="size-3.5" />
                  </span>
                </SectionContent>
              </Section>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
