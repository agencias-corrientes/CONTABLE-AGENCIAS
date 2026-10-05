import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

const PREVIEW_SUPABASE_URL = "https://hojrbnfzzljlgtvsyefx.supabase.co";
const PREVIEW_SUPABASE_KEY = "sb_publishable_N0hofSyJKbh9wSnAFmGm2g_dmjCHeIm";

export async function createClient() {
  const cookieStore = await cookies();
  const isPreview = process.env.NEXT_PUBLIC_APP_ENV === "preview";
  const url = isPreview ? PREVIEW_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = isPreview ? PREVIEW_SUPABASE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) throw new Error("Faltan las variables de Supabase.");

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // La renovación de sesión también se procesa desde proxy.ts.
        }
      },
    },
  });
}
