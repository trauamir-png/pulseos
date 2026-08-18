import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/collect", "/api/cron/podbean-sync", "/api/cron/rss-sync", "/api/admin/podbean-backfill", "/api/content"];
const CHANGE_PASSWORD_PATH = "/change-password";

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname === "/tracker.js"
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Onboarding gate: a user still on their initial temporary password may
  // only reach /change-password (plus public/static/API paths) until they
  // set a real one -- enforced here, server-side, so typing another PulseOS
  // URL can't bypass it. The profiles read fails OPEN (no redirect) on error
  // so a transient query hiccup, or this column not existing yet because the
  // migration hasn't been applied, can never lock every user out of the
  // app -- it only relaxes the onboarding gate, it never grants access to
  // any protected data that isn't already gated by its own auth check.
  if (user && !pathname.startsWith("/api/") && pathname !== "/tracker.js") {
    const { data: profile } = await supabase.from("profiles").select("must_change_password").eq("id", user.id).maybeSingle();
    const mustChangePassword = profile?.must_change_password === true;

    if (mustChangePassword && pathname !== CHANGE_PASSWORD_PATH) {
      return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, request.url));
    }
    if (!mustChangePassword && pathname === CHANGE_PASSWORD_PATH) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (pathname === "/login") {
      return NextResponse.redirect(new URL(mustChangePassword ? CHANGE_PASSWORD_PATH : "/", request.url));
    }
  }

  return response;
}
