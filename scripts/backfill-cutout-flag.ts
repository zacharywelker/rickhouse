/**
 * Fills in the cutout flag for photos stored before the flag existed (see
 * docs/superpowers/specs/2026-10-08-cutout-flag-design.md, section 5).
 *
 *   docker exec <container> node dist/backfill-cutout-flag.mjs [--dry-run]
 *   npm run photos:backfill-cutout -- [--dry-run]
 *
 * Reads each stored photo that has a path and no flag, runs the same alpha
 * count the upload does, and writes the result. Safe to run twice and to stop
 * part way: only photos still without a flag are looked at, and a photo
 * uploaded meanwhile keeps the flag it was given. --dry-run changes nothing
 * and prints the same report.
 *
 * The report lists the photos worth checking by eye before a client starts
 * reading the flag: photos with an alpha channel that were not called
 * cutouts, and cutouts close to the threshold. Stored files were trimmed when
 * they were uploaded, so their transparent share is smaller than the original's.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import sharp from "sharp";
import { analyzeAlpha, CUTOUT_MIN_TRANSPARENT } from "../src/lib/trim-transparent";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "/data/uploads");
const dryRun = process.argv.slice(2).includes("--dry-run");

/** Where each kind of photo keeps its paths and its flag. Constants, so safe to put in SQL. */
const TARGETS = [
  { label: "Bottle photos", table: "bottle_images", thumb: "thumb_path", file: "file_path", flag: "is_cutout" },
  { label: "Release photos", table: "expression_releases", thumb: "photo_thumb_path", file: "photo_path", flag: "photo_is_cutout" },
  { label: "Label photos", table: "expressions", thumb: "photo_thumb_path", file: "photo_path", flag: "photo_is_cutout" },
] as const;

/** A cutout this close to the threshold (a multiple of it) is listed for a second look. */
const NEAR_THE_LINE = CUTOUT_MIN_TRANSPARENT * 2.5;

type Note = { id: number; path: string; share: number };

/** The stored path resolved inside the uploads volume, or null if it climbs out of it. */
function resolveInside(relative: string): string | null {
  const resolved = path.resolve(uploadRoot, relative);
  return resolved.startsWith(uploadRoot + path.sep) ? resolved : null;
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const sql = postgres(url as string, { max: 1, onnotice: () => {} });
  try {
    for (const target of TARGETS) {
      // The thumbnail is what clients show, so it is the file the flag describes.
      const rows = await sql.unsafe<{ id: number; path: string }[]>(
        `SELECT id, COALESCE(${target.thumb}, ${target.file}) AS path
           FROM ${target.table}
          WHERE ${target.flag} IS NULL AND COALESCE(${target.thumb}, ${target.file}) IS NOT NULL
          ORDER BY id`,
      );

      let cutouts = 0;
      let photos = 0;
      let unreadable = 0;
      const alphaNotCutout: Note[] = [];
      const nearTheLine: Note[] = [];

      for (const row of rows) {
        const file = resolveInside(row.path);
        let analysis;
        try {
          if (!file) throw new Error("path leaves the uploads volume");
          analysis = await analyzeAlpha(sharp(await readFile(file), { failOn: "error" }).rotate());
        } catch (error: unknown) {
          unreadable++;
          console.warn(`  skipped ${target.table} #${row.id} (${row.path}): ${(error as Error).message}`);
          continue;
        }

        if (analysis.isCutout) {
          cutouts++;
          if (analysis.transparentShare < NEAR_THE_LINE) nearTheLine.push({ id: row.id, path: row.path, share: analysis.transparentShare });
        } else {
          photos++;
          if (analysis.transparentShare > 0) alphaNotCutout.push({ id: row.id, path: row.path, share: analysis.transparentShare });
        }

        if (!dryRun) {
          // Only while still unknown, so a photo uploaded since the query keeps its own flag.
          await sql.unsafe(`UPDATE ${target.table} SET ${target.flag} = $1 WHERE id = $2 AND ${target.flag} IS NULL`, [
            analysis.isCutout,
            row.id,
          ]);
        }
      }

      console.log(`${target.label}: ${rows.length} without a flag.`);
      console.log(`  ${cutouts} cutouts, ${photos} plain photos${unreadable ? `, ${unreadable} skipped` : ""}${dryRun ? " (dry run, nothing written)" : ""}`);
      for (const note of alphaNotCutout) {
        console.log(`  has an alpha channel, not a cutout: #${note.id} ${note.path} (${percent(note.share)} transparent)`);
      }
      for (const note of nearTheLine) {
        console.log(`  cutout near the line: #${note.id} ${note.path} (${percent(note.share)} transparent)`);
      }
    }
    console.log(`Threshold: ${percent(CUTOUT_MIN_TRANSPARENT)} of pixels transparent.`);
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
