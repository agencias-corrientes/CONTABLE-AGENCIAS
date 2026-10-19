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
  const requestedEmployeeConfirmation = requestedNext === "employee";
  let confirmed = false;
  let registrationType = "";
  let verifiedEmail = "";

  try {
    const supabase = await createClient();

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        confirmed = true;
        registrationType = String(data.session?.user?.user_metadata?.registration_type ?? "");
        verifiedEmail = String(data.session?.user?.email ?? "");
      }
    }

    // Some email templates provide a token hash directly. Try it if the code
    // exchange did not establish a session, rather than failing immediately.
    if (
      !confirmed &&
      tokenHash &&
      rawType &&
      supportedOtpTypes.includes(rawType as EmailOtpType)
    ) {
      const { data, error } = await (await createClient()).auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      });
      if (!error) {
        confirmed = true;
        registrationType = String(data.user?.user_metadata?.registration_type ?? "");
        verifiedEmail = String(data.user?.email ?? "");
      }
    }
  } catch {
    confirmed = false;
  }

  // If this link was already consumed but the browser has the confirmed session,
  // treat the callback as successful instead of showing a misleading expired-link error.
  // This does not bypass verification: getUser() must return a server-validated session
  // and Supabase must report that the email is confirmed.
  if (!confirmed) {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      const user = data.user;
      if (!error && user?.email_confirmed_at) {
        confirmed = true;
        registrationType = String(user.user_metadata?.registration_type ?? "");
        verifiedEmail = String(user.email ?? "");
      }
    } catch {
      // Keep the invalid-link path when no confirmed server session exists.
    }
  }

  // Prefer the account's server-returned metadata over a stale employee redirect
  // parameter: owner signup links must always return to the owner confirmation page.
  const isOwnerConfirmation =
    registrationType === "agency_owner" ||
    (verifiedEmail.length > 0 && !requestedEmployeeConfirmation);
  const isEmployeeConfirmation = requestedEmployeeConfirmation && !isOwnerConfirmation;

  // Only a short allow-list of internal routes may be used after an email link.
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
