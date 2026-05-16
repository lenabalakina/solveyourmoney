import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  LEMONSQUEEZY_API_KEY: z.string().min(1).optional(),
  LEMONSQUEEZY_STORE_ID: z.string().min(1).optional(),
  LEMONSQUEEZY_PLAN_VARIANT_ID: z.string().min(1).optional(),
  LEMONSQUEEZY_GUIDANCE_VARIANT_ID: z.string().min(1).optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  ADMIN_EMAIL_ALLOWLIST: z.string().optional(),
});

export const env = envSchema.parse(
  Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  ),
);

export function isSupabaseConfigured() {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isSupabaseAdminConfigured() {
  return isSupabaseConfigured() && Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isLemonSqueezyConfigured() {
  return Boolean(
    env.LEMONSQUEEZY_API_KEY &&
      env.LEMONSQUEEZY_STORE_ID &&
      env.LEMONSQUEEZY_PLAN_VARIANT_ID &&
      env.LEMONSQUEEZY_GUIDANCE_VARIANT_ID,
  );
}
