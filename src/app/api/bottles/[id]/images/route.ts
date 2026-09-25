import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bottleImages, bottles } from "@/db/schema";
import { requireSession } from "@/lib/auth";
import { mapDbError } from "@/lib/db-errors";
import { ImageError, storeBottleImage } from "@/lib/images";
import type { ActionResult } from "@/lib/admin/types";

/**
 * Uploads go through a route handler rather than a Server Action: Next.js
 * 15.5's Server Action path clones the request body when middleware is
 * present (this app's auth middleware matches every route), and that clone
 * can silently drop multipart file data in production — the request still
 * completes with a 200, just with an empty FormData on the other end. A
 * route handler reads the body directly and doesn't hit that path.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse<ActionResult>> {
  const user = await requireSession();

  const { id } = await params;
  const bottleId = Number(id);
  if (!Number.isInteger(bottleId)) {
    return NextResponse.json({ ok: false, error: "That bottle is gone." }, { status: 400 });
  }

  const formData = await request.formData();
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No images were selected." });
  }

  try {
    // Checked before any file is written, so a stranger's bottle id stores nothing.
    const owned = await db.$count(bottles, and(eq(bottles.id, bottleId), eq(bottles.ownerId, user.id)));
    if (owned === 0) return NextResponse.json({ ok: false, error: "That bottle is gone." }, { status: 404 });

    const [existing] = await db
      .select({ count: sql<number>`count(*)::int`, maxOrder: sql<number>`coalesce(max(${bottleImages.sortOrder}), -1)::int` })
      .from(bottleImages)
      .where(eq(bottleImages.bottleId, bottleId));

    let order = (existing?.maxOrder ?? -1) + 1;
    let isFirst = (existing?.count ?? 0) === 0;

    for (const file of files) {
      const stored = await storeBottleImage(file);
      await db.insert(bottleImages).values({
        bottleId,
        filePath: stored.filePath,
        thumbPath: stored.thumbPath,
        isPrimary: isFirst,
        // The hero photo is always the catalog photo; everything else is life.
        kind: isFirst ? "catalog" : "life",
        sortOrder: order,
      });
      order += 1;
      isFirst = false;
    }

    revalidatePath(`/bottles/${bottleId}`);
    revalidatePath("/bottles");
    return NextResponse.json({ ok: true, message: `${files.length} image${files.length === 1 ? "" : "s"} added.` });
  } catch (error: unknown) {
    if (error instanceof ImageError) return NextResponse.json({ ok: false, error: error.message });
    return NextResponse.json(mapDbError(error, { singular: "Image" }));
  }
}
