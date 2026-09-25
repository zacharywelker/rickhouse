"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { updateBackupSettings } from "@/lib/backup/settings";
import { runBackup } from "@/lib/backup/run";
import type { ActionResult } from "@/lib/admin/types";

export async function saveBackupSettingsAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const enabled = formData.get("enabled") === "on";
  const intervalHours = Number(formData.get("intervalHours"));
  const keep = Number(formData.get("keep"));

  if (!Number.isInteger(intervalHours) || intervalHours < 1) {
    return { ok: false, error: "Backup interval must be at least 1 hour." };
  }
  if (!Number.isInteger(keep) || keep < 0) {
    return { ok: false, error: "Backups to keep must be zero or more." };
  }

  await updateBackupSettings({ enabled, intervalHours, keep });
  revalidatePath("/system/backups");
  return { ok: true, message: "Backup settings saved." };
}

export async function runBackupNowAction(): Promise<ActionResult> {
  await requireAdmin();

  const result = await runBackup();
  revalidatePath("/system/backups");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Backup written to ${result.dir}.` };
}
