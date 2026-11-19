import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

// Optimistic check only. Real authorization happens in server code via requireUserId().
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  const { pathname } = request.nextUrl;
  // The landing page at "/" and the features page are public. The page itself sends signed-in visitors to /today.
  const isPublicPage =
    pathname === "/" ||
    pathname === "/features" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/admin/login";

  // Only bounce signed-out visitors. Signed-in visitors on /login are redirected by the page
  // itself after a real session check: a stale cookie must never cause a redirect loop.
  if (!hasSession && !isPublicPage) {
    // Admin pages have their own sign-in page.
    const toAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
    const url = new URL(toAdmin ? "/admin/login" : "/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Public files and metadata (favicon, icons, share images, manifest, worker) must load without
    // signing in, including for link-preview crawlers. Anything with a file extension is public.
    "/((?!api|_next/static|_next/image|offline|opengraph-image|twitter-image|.*\\..*).*)",
  ],
};
