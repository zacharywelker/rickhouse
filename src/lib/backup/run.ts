import "server-only";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { backupSettings } from "@/db/schema";
import { env } from "@/lib/env";
import { getBackupSettings } from "./settings";

/**
 * The app itself performs backups (no docker-compose exec, no host script):
 * it already holds DATABASE_URL and the uploads volume, so it dumps the
 * database and snapshots the photos directly. See docs/UNRAID.md#backups.
 */
export const BACKUP_PREFIX = "rickhouse-";

export type BackupResult = { ok: true; dir: string } | { ok: false; error: string };

export type BackupEntry = { name: string; path: string; createdAt: Date; sizeBytes: number };

function stamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Runs a command, checking only its exit code (tar, rsync). */
function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => reject(new Error(`${cmd} could not start: ${err.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || "no output"}`));
    });
  });
}

/** Runs a command and streams its stdout to a file, optionally gzipping it. */
function spawnToFile(cmd: string, args: string[], destPath: string, gzip: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    const out = createWriteStream(destPath);
    const source = gzip ? child.stdout.pipe(createGzip()) : child.stdout;

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    child.on("error", (err) => fail(new Error(`${cmd} could not start: ${err.message}`)));
    out.on("error", fail);
    source.pipe(out);

    child.on("close", (code) => {
      if (settled) return;
      if (code === 0) {
        settled = true;
        resolve();
      } else {
        fail(new Error(`${cmd} exited ${code}: ${stderr.trim() || "no output"}`));
      }
    });
  });
}

/** Existing, complete (non-`.partial`) backup directories, newest first. */
async function listBackupDirs(backupDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(backupDir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.startsWith(BACKUP_PREFIX) && !name.endsWith(".partial"))
    .sort((a, b) => b.localeCompare(a))
    .map((name) => path.join(backupDir, name));
}

async function findPreviousUploads(backupDir: string): Promise<string | null> {
  for (const dir of await listBackupDirs(backupDir)) {
    const uploads = path.join(dir, "uploads");
    if (await pathExists(uploads)) return uploads;
  }
  return null;
}

async function pruneOldBackups(backupDir: string, keep: number): Promise<void> {
  if (keep <= 0) return;
  const dirs = await listBackupDirs(backupDir);
  for (const dir of dirs.slice(keep)) {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeManifest(work: string, tables: string[]): Promise<void> {
  const lines = [
    "rickhouse backup",
    `taken: ${new Date().toISOString()}`,
    `tables: ${tables.length}`,
    "",
    "contents:",
    "  database.sql.gz - full pg_dump, for restoring Rickhouse",
    "  csv.tar.gz       - every table as plain CSV, for reading the data",
    "                     elsewhere (Baserow, NocoDB, Excel, ...) if Rickhouse",
    "                     itself is ever unavailable. Not restorable as-is.",
    "  uploads/         - uploaded photos/files. Files unchanged since the",
    "                     previous backup are hardlinks, not copies.",
  ];
  await writeFile(path.join(work, "manifest.txt"), lines.join("\n") + "\n");
}

async function recordRun(ok: boolean, error: string | null): Promise<void> {
  await db
    .update(backupSettings)
    .set({ lastRunAt: new Date(), lastRunOk: ok, lastRunError: error })
    .where(eq(backupSettings.id, 1));
}

/** Performs one full backup: database dump, CSV export, and a photo snapshot. */
export async function runBackup(): Promise<BackupResult> {
  const backupDir = env().BACKUP_DIR;
  const databaseUrl = env().DATABASE_URL;
  const uploadsDir = env().UPLOAD_DIR;
  const settings = await getBackupSettings();

  const dest = path.join(backupDir, `${BACKUP_PREFIX}${stamp()}`);
  const work = `${dest}.partial`;

  try {
    await mkdir(path.join(work, "csv"), { recursive: true });

    await spawnToFile(
      "pg_dump",
      ["--clean", "--if-exists", databaseUrl],
      path.join(work, "database.sql.gz"),
      true,
    );

    const tableRows = await db.execute<{ tablename: string }>(
      sql`select tablename from pg_tables where schemaname = 'public' order by tablename`,
    );
    const tables = tableRows.map((row) => row.tablename);
    for (const table of tables) {
      await spawnToFile(
        "psql",
        [databaseUrl, "-c", `\\copy (select * from "${table}") to stdout with csv header`],
        path.join(work, "csv", `${table}.csv`),
        false,
      );
    }
    await runCmd("tar", ["-czf", path.join(work, "csv.tar.gz"), "-C", work, "csv"]);
    await rm(path.join(work, "csv"), { recursive: true, force: true });

    if (await pathExists(uploadsDir)) {
      const prevUploads = await findPreviousUploads(backupDir);
      const workUploads = path.join(work, "uploads");
      await mkdir(workUploads, { recursive: true });
      const linkArgs = prevUploads ? [`--link-dest=${prevUploads}`] : [];
      await runCmd("rsync", ["-a", "--delete", ...linkArgs, `${uploadsDir}/`, `${workUploads}/`]);
    }

    await writeManifest(work, tables);
    await rename(work, dest);
    await pruneOldBackups(backupDir, settings.keep);
    await recordRun(true, null);
    return { ok: true, dir: dest };
  } catch (err: unknown) {
    await rm(work, { recursive: true, force: true }).catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    await recordRun(false, message.slice(0, 2000));
    return { ok: false, error: message };
  }
}

async function dirSize(target: string): Promise<number> {
  let total = 0;
  const entries = await readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else total += (await stat(full)).size;
  }
  return total;
}

/** Existing backups for the admin UI, newest first. */
export async function listBackups(): Promise<BackupEntry[]> {
  const backupDir = env().BACKUP_DIR;
  const dirs = await listBackupDirs(backupDir);
  return Promise.all(
    dirs.map(async (dir) => {
      const info = await stat(dir);
      return { name: path.basename(dir), path: dir, createdAt: info.mtime, sizeBytes: await dirSize(dir) };
    }),
  );
}
