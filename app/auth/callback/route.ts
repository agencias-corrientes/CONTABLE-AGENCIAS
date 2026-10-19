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
  const isEmployeeConfirmation = requestedNext === "employee";
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

  // Only a short allow-list of internal routes may be used after an email link.
  // Employee confirmation must return to the employee login, not the owner setup flow.
  let destination: string;
  if (isPasswordRecovery) {
    destination = confirmed ? "/cambiar-clave" : "/cambiar-clave?enlace=invalid";
  } else if (isEmployeeConfirmation) {
    destination = confirmed
      ? "/login?perfil=empleado&confirmado=1"
      : "/login?perfil=empleado&confirmacion=error";
  } else {
    destination = confirmed ? "/registro/confirmado" : "/registro/confirmacion-error";
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
