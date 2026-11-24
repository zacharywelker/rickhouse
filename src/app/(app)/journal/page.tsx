import type { Metadata } from "next";

export const metadata: Metadata = { title: "Journal" };

/** Placeholder until the web tasting log is designed. A page, not a redirect, so Back works and the nav marks Journal current. */
export default function JournalPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-3xl text-accent">Journal</h1>
      <p className="mt-1 text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}
