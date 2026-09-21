import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Node runtime, not Edge: the Edge bundler inlines `process.env` at build
 * time, and this image is built once and configured at run time on Unraid.
 */
export const runtime = "nodejs";

const PUBLIC_PATHS = new Set(["/login", "/api/health"]);

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    // Misconfiguration must not fail open.
    return new NextResponse("SESSION_SECRET is not configured", { status: 500 });
  }

  const authed = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret);

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && authed) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!authed) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
