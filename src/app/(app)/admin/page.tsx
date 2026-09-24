import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RESOURCES, RESOURCE_KEYS } from "@/lib/admin/registry";

export const metadata: Metadata = { title: "Configuration" };
export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const counts = await Promise.all(
    RESOURCE_KEYS.map(async (key) => ({ key, count: (await RESOURCES[key].list()).length })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The shared vocabulary behind every bottle. Everything here is a real record rather than free text, which is
          what makes &ldquo;show me everything Bardstown distilled&rdquo; work even when the bottle is a three-way
          blend.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map(({ key, count }) => {
          const config = RESOURCES[key];
          return (
            <Link key={key} href={`/admin/${key}` as Route} className="group">
              <Card className="h-full rounded-none shadow-none transition-colors group-hover:border-primary/50">
                <CardContent className="flex h-full flex-col gap-2 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-lg">{config.label}</h2>
                    <span className="text-2xl tabular-nums text-accent">{count}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Manage
                    <ArrowRight className="size-3.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
