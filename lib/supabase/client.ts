import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

const PREVIEW_SUPABASE_URL = "https://hojrbnfzzljlgtvsyefx.supabase.co";
const PREVIEW_SUPABASE_KEY = "sb_publishable_N0hofSyJKbh9wSnAFmGm2g_dmjCHeIm";

export function createClient() {
  const isPreview = process.env.NEXT_PUBLIC_APP_ENV === "preview";
  const url = isPreview ? PREVIEW_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = isPreview ? PREVIEW_SUPABASE_KEY : process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) throw new Error("Faltan las variables de Supabase.");

  return createBrowserClient<Database>(url, key);
}
