import { readFile, stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { ImageError, contentTypeFor, resolveUpload } from "@/lib/images";

/**
 * Serves bottle photos from the uploads volume.
 *
 * The volume lives outside `public/` so images survive an image rebuild, which
 * means they need a route. Middleware gates this path like any other, so
 * photos are behind the login rather than world-readable by URL.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await params;
  const relative = segments.join("/");

  try {
    const absolute = resolveUpload(relative);
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
