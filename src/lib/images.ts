import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";

/**
 * Bottle photos live on a mounted volume, not in the database and not in
 * `public/` — they have to survive an image rebuild (SPEC: Deployment).
 *
 * Stored names are UUIDs. Nothing derived from the upload's own filename
 * reaches the disk, which removes a whole class of path problems at the
 * source rather than sanitising after the fact.
 */

const ORIGINALS = "bottles";
const THUMBS = "bottles/thumbs";

/** Formats sharp can read that a browser can display. */
const ACCEPTED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type StoredImage = { filePath: string; thumbPath: string; width: number; height: number };

export class ImageError extends Error {}

function uploadRoot(): string {
  return path.resolve(env().UPLOAD_DIR);
}

/**
 * Resolves a stored relative path inside the uploads volume, refusing
 * anything that climbs out of it. Every read path goes through this.
 */
export function resolveUpload(relative: string): string {
  const root = uploadRoot();
  const resolved = path.resolve(root, relative);
  // `path.resolve` collapses `..`, so this comparison is the actual check.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ImageError("Refusing to read outside the uploads directory.");
  }
  return resolved;
}

export async function storeBottleImage(file: File): Promise<StoredImage> {
  const extension = ACCEPTED.get(file.type);
  if (!extension) {
    throw new ImageError(`${file.type || "That file type"} is not an image this app can store.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ImageError(`Images have to be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }

  const root = uploadRoot();
  await mkdir(path.join(root, THUMBS), { recursive: true });

  const id = randomUUID();
  const buffer = Buffer.from(await file.arrayBuffer());

  // Re-encode rather than trusting the upload: this normalises HEIC from an
  // iPhone, strips EXIF (including GPS), and applies the orientation tag so
  // portrait shots are not served sideways.
  const pipeline = sharp(buffer, { failOn: "error" }).rotate();
  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageError("That file does not look like an image.");
  }

  const fileRelative = path.posix.join(ORIGINALS, `${id}.webp`);
  const thumbRelative = path.posix.join(THUMBS, `${id}.webp`);

  const full = await pipeline
    .clone()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 86 })
    .toBuffer({ resolveWithObject: true });

  const thumb = await pipeline
    .clone()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  await writeFile(resolveUpload(fileRelative), full.data);
  await writeFile(resolveUpload(thumbRelative), thumb);

  return {
    filePath: fileRelative,
    thumbPath: thumbRelative,
    width: full.info.width,
    height: full.info.height,
  };
}

/** Best effort: a missing file must not stop the database row being removed. */
export async function deleteBottleImage(filePath: string, thumbPath: string | null): Promise<void> {
  for (const relative of [filePath, thumbPath]) {
    if (!relative) continue;
    try {
      await unlink(resolveUpload(relative));
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT") console.warn("[rickhouse] could not delete image", relative, error);
    }
  }
}

export function contentTypeFor(relative: string): string {
  const ext = path.extname(relative).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
}
