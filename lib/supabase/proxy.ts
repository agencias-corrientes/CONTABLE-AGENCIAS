import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PREVIEW_SUPABASE_URL = "https://hojrbnfzzljlgtvsyefx.supabase.co";
const PREVIEW_SUPABASE_KEY = "sb_publishable_N0hofSyJKbh9wSnAFmGm2g_dmjCHeIm";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isPreview = process.env.VERCEL_ENV === "preview";
  const url = isPreview ? PREVIEW_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = isPreview ? PREVIEW_SUPABASE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

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

  await supabase.auth.getClaims();
  return response;
}
