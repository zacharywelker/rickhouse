import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth/server";

/**
 * Node runtime, not Edge: the Edge bundler inlines `process.env` at build
 * time, and this image is built once and configured at run time on Unraid.
 * It also lets the session check below read the database directly.
 */
export const runtime = "nodejs";

const PUBLIC_PATHS = new Set(["/login", "/login/two-factor", "/cut-off", "/forgot-password", "/reset-password"]);
const SETUP_PATH = "/account/setup";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Better Auth's own endpoints do their own checks (and sign-in has to be
  // reachable without a session). The health check stays a pure database
  // probe for Docker, with no session lookup in front of it.
  if (pathname.startsWith("/api/auth/") || pathname === "/api/health") return NextResponse.next();

  // A real database lookup, not just a signature check: a deactivated user
  // or a revoked session is out on the very next request.
  const { headers: sessionHeaders, response: session } = await (await getAuth()).api.getSession({
    headers: request.headers,
    returnHeaders: true,
  });

  // getSession may slide the expiry forward or clear a dead cookie; pass
  // those cookies on whatever we answer.
  const respond = (response: NextResponse): NextResponse => {
    for (const cookie of sessionHeaders.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  };

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/login" && session) return respond(NextResponse.redirect(new URL("/", request.url)));
    return respond(NextResponse.next());
  }

  if (!session) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return respond(NextResponse.redirect(login));
  }

  // Generated passwords (first run, CLI reset, new accounts) are for one
  // sign-in only.
  if (session.user.mustChangePassword && pathname !== SETUP_PATH) {
    return respond(NextResponse.redirect(new URL(SETUP_PATH, request.url)));
  }

  return respond(NextResponse.next());
}

export const config = {
  // Everything except Next's own assets, the favicon, and bottle photo
  // uploads. Uploads are excluded rather than gated here because Next 15.5's
  // request-body clone for middleware-matched routes can silently drop
  // multipart file data in production; the upload route checks the session
  // itself instead (see src/app/api/bottles/[id]/images/route.ts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|api/bottles/[^/]+/images).*)"],
};
