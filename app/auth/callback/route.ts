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

  // Use only fixed internal destinations. Recovery links must return to the password
  // form after Supabase has exchanged the one-time code for a session.
  const recoveryFlow = url.searchParams.get("flow") === "recovery" || rawType === "recovery";
  const destination = !confirmed
    ? "/registro/confirmacion-error"
    : recoveryFlow
      ? "/recuperar/nueva"
      : "/registro/confirmado";

  return NextResponse.redirect(new URL(destination, url.origin));
}
