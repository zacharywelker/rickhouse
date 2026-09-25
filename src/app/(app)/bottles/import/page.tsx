import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, SectionContent, SectionDescription, SectionHeader, SectionTitle } from "@/components/ui/section";
import { ImportForm } from "@/components/bottles/import-form";
import { TRANSFER_HEADERS } from "@/lib/bottles/transfer";

export const metadata: Metadata = { title: "Import bottles" };
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Import bottles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per bottle. Brands, distilleries, finishes and stores are created as they are encountered;
          categories are not, because guessing where a spirit belongs in the tree is how a taxonomy rots.
        </p>
      </div>

      <Section>
        <SectionHeader>
          <SectionTitle>The columns</SectionTitle>
          <SectionDescription>
            Only <code className="text-foreground">brand</code>, <code className="text-foreground">expression</code>{" "}
            and <code className="text-foreground">category</code> are required. Lists take semicolons.
          </SectionDescription>
        </SectionHeader>
        <SectionContent className="flex flex-col gap-3">
          {/* Wrapped, not scrolled: the point of the block is to see every column at once. */}
          <code className="block whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
            {TRANSFER_HEADERS.join(",")}
          </code>
          <p className="text-sm text-muted-foreground">
            The export uses exactly this shape, so the quickest way to get a template is to{" "}
            <a href="/api/bottles/export" download className="text-primary hover:underline">
              download your collection
            </a>{" "}
            and edit it.
          </p>
          <Button variant="outline" size="sm" className="w-fit" asChild>
            <a href="/api/bottles/export" download>
              <Download className="size-4" />
              Download current collection
            </a>
          </Button>
        </SectionContent>
      </Section>

      <ImportForm />
    </div>
  );
}
