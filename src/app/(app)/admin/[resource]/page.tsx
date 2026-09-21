import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResourceView } from "@/components/admin/resource-view";
import { RESOURCES, isResourceKey } from "@/lib/admin/registry";

/**
 * One route for all eight lookup entities; the registry supplies the rest.
 *
 * Deliberately no `generateStaticParams`: it would prerender these at build
 * time, and the image is built in CI with no database to read from.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ resource: string }>;
}): Promise<Metadata> {
  const { resource } = await params;
  return { title: isResourceKey(resource) ? RESOURCES[resource].label : "Not found" };
}

export default async function ResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  if (!isResourceKey(resource)) notFound();

  const config = RESOURCES[resource];
  const [rows, options] = await Promise.all([config.list(), config.optionsFor()]);

  return (
    <ResourceView
      resourceKey={config.key}
      label={config.label}
      singular={config.singular}
      description={config.description}
      fields={config.fields}
      columns={config.columns}
      rows={rows}
      options={options}
    />
  );
}
