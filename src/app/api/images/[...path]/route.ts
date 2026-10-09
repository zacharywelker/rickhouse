import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles, colaImages, expressionColas, expressionReleases, expressions, groups } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { thumbPathForTile } from "@/lib/cutout-tile";
import { ImageError, contentTypeFor, ensureTile, resolveUpload } from "@/lib/images";

/** A bottle cutout's gallery tile: `bottles/tiles/<uuid>.webp`, owned by whoever owns the thumbnail with the same name. */
const TILE_PATH = /^bottles\/tiles\/([0-9a-f-]{36})\.webp$/;

/**
 * Serves bottle photos from the uploads volume.
 *
 * The volume lives outside `public/` so images survive an image rebuild, which
 * means they need a route. Middleware gates this path like any other, so
 * photos are behind the login rather than world-readable by URL — and each
 * file is served only to the account whose bottle or group it belongs to.
 */
export const dynamic = "force-dynamic";

/** True when `relative` is one of `ownerId`'s bottle, label or release photos (or thumbnails), group covers or COLA label images. */
async function ownsUpload(relative: string, ownerId: number): Promise<boolean> {
  const [photo] = await db
    .select({ id: bottleImages.id })
    .from(bottleImages)
    .innerJoin(bottles, eq(bottles.id, bottleImages.bottleId))
    .where(
      and(eq(bottles.ownerId, ownerId), or(eq(bottleImages.filePath, relative), eq(bottleImages.thumbPath, relative))),
    )
    .limit(1);
  if (photo) return true;
  const [label] = await db
    .select({ id: colaImages.id })
    .from(colaImages)
    .innerJoin(expressionColas, eq(expressionColas.id, colaImages.colaId))
    .where(
      and(
        eq(expressionColas.ownerId, ownerId),
        or(eq(colaImages.filePath, relative), eq(colaImages.thumbPath, relative), eq(colaImages.displayPath, relative)),
      ),
    )
    .limit(1);
  if (label) return true;
  const labelPhoto = and(
    eq(expressions.ownerId, ownerId),
    or(eq(expressions.photoPath, relative), eq(expressions.photoThumbPath, relative)),
  );
  if ((await db.$count(expressions, labelPhoto)) > 0) return true;
  const [release] = await db
    .select({ id: expressionReleases.id })
    .from(expressionReleases)
    .innerJoin(expressions, eq(expressions.id, expressionReleases.expressionId))
    .where(
      and(
        eq(expressions.ownerId, ownerId),
        or(eq(expressionReleases.photoPath, relative), eq(expressionReleases.photoThumbPath, relative)),
      ),
    )
    .limit(1);
  if (release) return true;
  return (await db.$count(groups, and(eq(groups.ownerId, ownerId), eq(groups.coverImagePath, relative)))) > 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const user = await requireSession();
  const { path: segments } = await params;
  const relative = segments.join("/");

  try {
    // Same answer for "not yours" as for "not there".
    const tile = TILE_PATH.exec(relative);
    const ownedPath = tile ? thumbPathForTile(relative) : relative;
    if (!ownedPath || !(await ownsUpload(ownedPath, user.id))) return new NextResponse("Not found", { status: 404 });
    const absolute = resolveUpload(relative);
    // Photos from before tiles existed get theirs on first request; a photo that is no cutout has none.
    if (tile) {
      try {
        await stat(absolute);
      } catch (error: unknown) {
        if ((error as { code?: string }).code !== "ENOENT" || !(await ensureTile(tile[1]!))) {
          return new NextResponse("Not found", { status: 404 });
        }
      }
    }
    const info = await stat(absolute);
    if (!info.isFile()) return new NextResponse("Not found", { status: 404 });

    const body = await readFile(absolute);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": contentTypeFor(relative),
        "Content-Length": String(info.size),
        // Names are UUIDs and content never changes under one, so this is
        // safe to cache hard. Private: these are behind a session.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    if (error instanceof ImageError) {
      console.warn("[rickhouse] rejected image path", relative);
      return new NextResponse("Not found", { status: 404 });
    }
    if ((error as { code?: string }).code === "ENOENT") {
      return new NextResponse("Not found", { status: 404 });
    }
    console.error("[rickhouse] failed to serve image", relative, error);
    return new NextResponse("Error", { status: 500 });
  }
}
