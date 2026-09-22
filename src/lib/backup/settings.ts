import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { backupSettings } from "@/db/schema";

export type BackupSettings = {
  enabled: boolean;
  intervalHours: number;
  keep: number;
  lastRunAt: Date | null;
  lastRunOk: boolean | null;
  lastRunError: string | null;
};

const DEFAULTS: BackupSettings = {
  enabled: false,
  intervalHours: 24,
  keep: 14,
  lastRunAt: null,
  lastRunOk: null,
  lastRunError: null,
};

/** The single settings row, creating it with defaults on first read. */
export async function getBackupSettings(): Promise<BackupSettings> {
  const [row] = await db.select().from(backupSettings).where(eq(backupSettings.id, 1)).limit(1);
  if (row) return row;
  await db.insert(backupSettings).values({ id: 1 }).onConflictDoNothing();
  return DEFAULTS;
}

export async function updateBackupSettings(
  patch: Partial<Pick<BackupSettings, "enabled" | "intervalHours" | "keep">>,
): Promise<void> {
  await db
    .insert(backupSettings)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({ target: backupSettings.id, set: patch });
}
