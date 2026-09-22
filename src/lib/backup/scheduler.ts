import "server-only";
import { getBackupSettings } from "./settings";
import { runBackup } from "./run";

/** How often to check whether a backup is due. The schedule itself is hours. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let started = false;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const settings = await getBackupSettings();
    if (!settings.enabled) return;
    const dueAt = settings.lastRunAt ? settings.lastRunAt.getTime() + settings.intervalHours * 3_600_000 : 0;
    if (Date.now() < dueAt) return;

    console.log("[rickhouse] running scheduled backup");
    const result = await runBackup();
    if (result.ok) console.log(`[rickhouse] scheduled backup wrote ${result.dir}`);
    else console.error(`[rickhouse] scheduled backup failed: ${result.error}`);
  } catch (err) {
    console.error("[rickhouse] backup scheduler tick failed:", err);
  } finally {
    running = false;
  }
}

/**
 * Starts the in-process backup scheduler. Safe to call more than once — only
 * the first call does anything, so a hot-reloaded module doesn't stack timers.
 */
export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  // A short delay after boot, in case a scheduled run was missed while down.
  setTimeout(() => void tick(), 30_000);
  setInterval(() => void tick(), CHECK_INTERVAL_MS);
}
