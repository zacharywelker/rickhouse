import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { apiError } from "@/lib/api/v1";

export const dynamic = "force-dynamic";

/** Who the token belongs to. The app calls this on launch to see whether it is still signed in. */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Sign in first.");
  return NextResponse.json({
    user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
  });
}
