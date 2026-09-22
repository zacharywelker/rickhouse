/**
 * Next.js calls `register()` once per server instance at boot. Used here to
 * start the in-process backup scheduler (src/lib/backup/scheduler.ts) —
 * guarded to the Node runtime so it never runs in the Edge runtime or during
 * `next build`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackupScheduler } = await import("@/lib/backup/scheduler");
  startBackupScheduler();
}
