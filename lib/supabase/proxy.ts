import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
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
  });

  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims?.sub) {
    // getClaims verifies the JWT locally; getUser confirms the account still exists in Auth.
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const status = Number((userError as { status?: number } | null)?.status ?? 0);
    const confirmedMissingUser = !userData.user && Boolean(userError) && [400, 401, 403, 404].includes(status);

    if (confirmedMissingUser) {
      await supabase.auth.signOut({ scope: "local" });
      const authCookieNames = request.cookies.getAll()
        .map(({ name }) => name)
        .filter((name) => name.includes("auth-token"));
      for (const name of authCookieNames) request.cookies.delete(name);

      response = NextResponse.next({ request });
      for (const name of authCookieNames) response.cookies.set(name, "", { path: "/", maxAge: 0 });

      const pathname = request.nextUrl.pathname;
      const isPublicPath = pathname === "/login" || pathname === "/registro" || pathname.startsWith("/auth/");
      if (!isPublicPath) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        loginUrl.searchParams.set("error", "cuenta_no_activa");
        const redirectResponse = NextResponse.redirect(loginUrl);
        response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
        return redirectResponse;
      }
    }
  }

  return response;
}
