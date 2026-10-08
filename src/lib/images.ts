import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";
import { analyzeAlpha } from "./trim-transparent";

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
const GROUP_ORIGINALS = "groups";
const GROUP_THUMBS = "groups/thumbs";
const COLA_ORIGINALS = "colas";
const COLA_THUMBS = "colas/thumbs";
const COLA_DISPLAY = "colas/display";

/** Formats sharp can read that a browser can display. */
const ACCEPTED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  // TTB's label scans (SPEC M11) are mostly JPEG, but older ones are GIF or TIFF.
  ["image/gif", "gif"],
  ["image/tiff", "tiff"],
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type StoredImage = {
  filePath: string;
  thumbPath: string;
  /** A mid-size rendition, for encodings that ask for one. */
  displayPath?: string;
  width: number;
  height: number;
  /** Real transparency around the subject, so a card may stand it on a plate. */
  isCutout: boolean;
};

/** How the full-size file is encoded, and whether a mid-size rendition is kept too. */
type Encoding = {
  fullMax: number;
  fullQuality: number;
  display?: { dir: string; max: number };
  /** Crop away transparent margins around the subject. */
  trimTransparent?: boolean;
};

/** Photos: plenty for a screen, small enough for a phone upload's worth of them. */
const PHOTO: Encoding = { fullMax: 2000, fullQuality: 86, trimTransparent: true };

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

async function storeImage(file: File, originalsDir: string, thumbsDir: string): Promise<StoredImage> {
  return storeImageBytes(Buffer.from(await file.arrayBuffer()), file.type, originalsDir, thumbsDir);
}

async function storeImageBytes(
  buffer: Buffer,
  type: string,
  originalsDir: string,
  thumbsDir: string,
  encoding: Encoding = PHOTO,
): Promise<StoredImage> {
  const extension = ACCEPTED.get(type);
  if (!extension) {
    throw new ImageError(`${type || "That file type"} is not an image this app can store.`);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ImageError(`Images have to be under ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }

  const root = uploadRoot();
  await mkdir(path.join(root, thumbsDir), { recursive: true });
  if (encoding.display) await mkdir(path.join(root, encoding.display.dir), { recursive: true });

  const id = randomUUID();

  // Re-encode rather than trusting the upload: this normalises HEIC from an
  // iPhone, strips EXIF (including GPS), and applies the orientation tag so
  // portrait shots are not served sideways.
  const oriented = sharp(buffer, { failOn: "error" }).rotate();
  const meta = await oriented.metadata();
  if (!meta.width || !meta.height) {
    throw new ImageError("That file does not look like an image.");
  }

  // Cut-out photos often arrive on a big transparent canvas that leaves the
  // bottle tiny. Crop to the visible pixels (rotate runs before extract).
  // Label scans skip this: they are never cutouts, and a 6000px walk is not free.
  const { box, isCutout } = encoding.trimTransparent ? await analyzeAlpha(oriented) : { box: null, isCutout: false };
  const pipeline = box ? oriented.clone().extract(box) : oriented;

  const fileRelative = path.posix.join(originalsDir, `${id}.webp`);
  const thumbRelative = path.posix.join(thumbsDir, `${id}.webp`);

  const full = await pipeline
    .clone()
    .resize({ width: encoding.fullMax, height: encoding.fullMax, fit: "inside", withoutEnlargement: true })
    .webp({ quality: encoding.fullQuality })
    .toBuffer({ resolveWithObject: true });

  const thumb = await pipeline
    .clone()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  await writeFile(resolveUpload(fileRelative), full.data);
  await writeFile(resolveUpload(thumbRelative), thumb);

  let displayRelative: string | undefined;
  if (encoding.display) {
    displayRelative = path.posix.join(encoding.display.dir, `${id}.webp`);
    const { max } = encoding.display;
    const display = await pipeline
      .clone()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 86 })
      .toBuffer();
    await writeFile(resolveUpload(displayRelative), display);
  }

  return {
    filePath: fileRelative,
    thumbPath: thumbRelative,
    ...(displayRelative ? { displayPath: displayRelative } : {}),
    width: full.info.width,
    height: full.info.height,
    isCutout,
  };
}

export async function storeBottleImage(file: File): Promise<StoredImage> {
  return storeImage(file, ORIGINALS, THUMBS);
}

/** A bottle photo downloaded from a link. */
export async function storeBottleImageBytes(bytes: Buffer, contentType: string): Promise<StoredImage> {
  return storeImageBytes(bytes, contentType, ORIGINALS, THUMBS);
}

/**
 * A new bottle photo copied from another stored image (a COLA label panel).
 * A copy, not a shared path, so deleting either never breaks the other.
 */
export async function copyToBottleImage(relative: string): Promise<StoredImage> {
  return storeImageBytes(await readFile(resolveUpload(relative)), contentTypeFor(relative), ORIGINALS, THUMBS);
}

/** A Group's cover image (DESIGN.md §23). Same pipeline, a separate directory. */
export async function storeGroupCoverImage(file: File): Promise<StoredImage> {
  return storeImage(file, GROUP_ORIGINALS, GROUP_THUMBS);
}

/**
 * An approved label panel from the COLA registry (SPEC M11). Label art is the
 * point, so the full file keeps the scan's own resolution (up to 6000px) at
 * a higher quality than photos get, with a 1200px rendition for showing it
 * large on a page without sending the whole scan.
 */
export async function storeColaImage(bytes: Buffer, contentType: string): Promise<StoredImage> {
  return storeImageBytes(bytes, contentType, COLA_ORIGINALS, COLA_THUMBS, {
    fullMax: 6000,
    fullQuality: 92,
    display: { dir: COLA_DISPLAY, max: 1200 },
  });
}

/**
 * Best effort: a missing file must not stop the database row being removed.
 * Generic over bottle photos, Group cover images and COLA label art — each a
 * full-size file plus a thumbnail (and, for label art, a display rendition).
 */
export async function deleteStoredImage(
  filePath: string,
  thumbPath: string | null,
  displayPath: string | null = null,
): Promise<void> {
  for (const relative of [filePath, thumbPath, displayPath]) {
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
