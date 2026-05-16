"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signUpSchema, authEmailSchema } from "@/lib/validation/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/server/services/audit";

export type AuthFormState = {
  status: "idle" | "error";
  message: string;
};

export async function signUpAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Check your name, email, and password." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Authentication is not configured. Add Supabase env vars before launch.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        display_name: parsed.data.displayName,
      },
      emailRedirectTo: `${siteUrl}/callback`,
    },
  });

  if (error) {
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  await writeAuditLog({
    actorId: data.user?.id ?? null,
    action: "auth.sign_up",
    targetType: "profile",
    targetId: data.user?.id ?? null,
  });

  // When email confirmation is enabled, signUp() returns a user but no session.
  // Redirect only if we actually have a session; otherwise tell them to check email.
  if (!data.session) {
    return {
      status: "idle",
      message: "Account created! Check your inbox to confirm your email before signing in.",
    };
  }

  redirect("/onboarding");
}

export async function signInAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = authEmailSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email and password." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Authentication is not configured. Add Supabase env vars before launch.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { status: "error", message: "The email or password was not accepted." };
  }

  await writeAuditLog({
    actorId: data.user.id,
    action: "auth.sign_in",
    targetType: "profile",
    targetId: data.user.id,
  });

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function requestPasswordResetAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = formData.get("email");

  const emailSchema = z.string().email().max(254);
  const parsed = emailSchema.safeParse(typeof email === "string" ? email.trim() : "");
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Authentication is not configured. Add Supabase env vars before launch.",
    };
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  // Supabase sends the reset email via its own SMTP. Configure SMTP in the
  // Supabase dashboard (Authentication → Email → SMTP settings) before launch.
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/callback?next=/reset-password`,
  });

  // Always return a generic message to prevent email enumeration attacks.
  return {
    status: "idle",
    message: "If that email is registered, a reset link is on its way.",
  };
}

export async function updatePasswordAction(
  _state: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = formData.get("password");

  const passwordSchema = z.string().min(8).max(128);
  const parsedPassword = passwordSchema.safeParse(typeof password === "string" ? password : "");
  if (!parsedPassword.success) {
    return { status: "error", message: "Password must be 8–128 characters." };
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return {
      status: "error",
      message: "Authentication is not configured. Add Supabase env vars before launch.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsedPassword.data });

  if (error) {
    return { status: "error", message: "We could not update your password. The reset link may have expired — request a new one at /forgot-password." };
  }

  redirect("/dashboard");
}
