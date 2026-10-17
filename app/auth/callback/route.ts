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
  const requestedNext = url.searchParams.get("next");
  const isPasswordRecovery = requestedNext === "/cambiar-clave";
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

  // Only allow the password-recovery route as an alternate destination.
  // Never redirect to arbitrary paths supplied through an email URL.
  const destination = confirmed
    ? isPasswordRecovery ? "/cambiar-clave" : "/registro/confirmado"
    : isPasswordRecovery ? "/cambiar-clave?enlace=invalid" : "/registro/confirmacion-error";

  return NextResponse.redirect(new URL(destination, url.origin));
}
