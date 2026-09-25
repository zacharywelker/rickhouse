import type { Metadata } from "next";
import { Section, SectionContent } from "@/components/ui/section";
import { getBackupSettings } from "@/lib/backup/settings";
import { listBackups } from "@/lib/backup/run";
import { BackupSettingsForm } from "./settings-form";
import { RunBackupButton } from "./run-backup-button";

export const metadata: Metadata = { title: "Backups" };
export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export default async function BackupsPage() {
  const [settings, backups] = await Promise.all([getBackupSettings(), listBackups()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl text-accent">Backups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each backup writes a full database dump, a plain-CSV export of every table, and a snapshot of uploaded
          photos to the backups volume. Unchanged photos are hardlinked between backups rather than copied, so
          keeping many backups doesn&rsquo;t cost many copies of the photo library.
        </p>
      </div>

      <Section className="max-w-2xl">
        <SectionContent className="flex flex-col gap-4 pb-2 pt-4">
          <h2 className="text-lg">Schedule</h2>
          <BackupSettingsForm enabled={settings.enabled} intervalHours={settings.intervalHours} keep={settings.keep} />
        </SectionContent>
      </Section>

      <Section className="max-w-2xl">
        <SectionContent className="flex flex-col gap-4 pb-2 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg">Manual backup</h2>
            {settings.lastRunAt ? (
              <p className="text-sm text-muted-foreground">
                Last run {settings.lastRunAt.toLocaleString()} &mdash;{" "}
                {settings.lastRunOk ? "succeeded" : `failed: ${settings.lastRunError ?? "unknown error"}`}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No backup has run yet.</p>
            )}
          </div>
          <RunBackupButton />
        </SectionContent>
      </Section>

      <Section>
        <SectionContent className="flex flex-col gap-4 pb-2 pt-4">
          <h2 className="text-lg">Existing backups</h2>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No backups yet. They&rsquo;ll appear here once one runs, at {"{BACKUP_DIR}"} on the host.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {backups.map((backup) => (
                <li key={backup.name} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-mono">{backup.name}</span>
                  <span className="text-muted-foreground">
                    {backup.createdAt.toLocaleString()} &middot; {formatBytes(backup.sizeBytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm text-muted-foreground">
            Backups live on the backups volume, not in the app &mdash; pull them off through the file system (or your
            Unraid share) the same way you would any other backup. Each one contains{" "}
            <code>database.sql.gz</code> (restores Rickhouse), <code>csv.tar.gz</code> (opens in Baserow, NocoDB,
            Excel, or similar, without Rickhouse), and <code>uploads/</code> (the photos). See{" "}
            <code>docs/UNRAID.md</code> for restore commands.
          </p>
        </SectionContent>
      </Section>
    </div>
  );
}
