import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const rawNext = url.searchParams.get("next") ?? "/dashboard";
  // Reject absolute and protocol-relative URLs to prevent open redirect
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";
  const origin = url.origin;

  // Supabase sends ?error=... when the link is expired or already used
  if (error) {
    return NextResponse.redirect(new URL("/forgot-password?error=link_expired", origin));
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (!exchangeError) {
        return NextResponse.redirect(new URL(next, origin));
      }
    }
  }

  // Code missing or exchange failed — redirect to sign-in
  return NextResponse.redirect(new URL("/sign-in", origin));
}
