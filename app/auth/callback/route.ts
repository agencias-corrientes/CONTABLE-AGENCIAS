import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const supportedOtpTypes: EmailOtpType[] = [
  "signup",
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  let confirmed = false;

  try {
    const supabase = await createClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      confirmed = !error;
    } else if (
      tokenHash &&
      rawType &&
      supportedOtpTypes.includes(rawType as EmailOtpType)
    ) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      });
      confirmed = !error;
    }
  } catch {
    confirmed = false;
  }

  // Never trust a URL supplied by the email query string for the post-confirmation
  // destination. A successful verification always opens our own success page.
  return NextResponse.redirect(
    new URL(confirmed ? "/registro/confirmado" : "/registro/confirmacion-error", url.origin),
  );
}
