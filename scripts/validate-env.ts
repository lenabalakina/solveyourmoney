import { loadEnv } from "../lib/config/env";

try {
  const env = loadEnv(process.env as NodeJS.ProcessEnv);

  if (env.NEXT_PUBLIC_APP_ENV === "production" && env.USE_MOCK) {
    console.error(
      "validate-env: Mock data flag is enabled in production — failing build",
    );
    process.exitCode = 2;
    throw new Error("Mock data is not allowed in production");
  }

  if (
    env.NEXT_PUBLIC_APP_ENV === "preview" &&
    env.USE_MOCK &&
    !env.ALLOW_PREVIEW_MOCK
  ) {
    console.warn(
      "validate-env: WARN — Mock data is enabled in preview but ALLOW_PREVIEW_MOCK_DATA is not set. " +
        "Set ALLOW_PREVIEW_MOCK_DATA=true to allow, or set NEXT_PUBLIC_USE_MOCK_DATA=false.",
    );
  }

  // Production requires Supabase credentials — fail the build if missing.
  if (env.NEXT_PUBLIC_APP_ENV === "production") {
    const missing: string[] = [];
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (missing.length > 0) {
      console.error(
        `validate-env: Missing required production env vars: ${missing.join(", ")}`,
      );
      process.exitCode = 2;
      throw new Error(`Required in production: ${missing.join(", ")}`);
    }
  }

  console.log("validate-env: OK", {
    env: env.NEXT_PUBLIC_APP_ENV,
    useMock: env.USE_MOCK,
  });
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("validate-env: Configuration invalid", message);
  if (!process.exitCode) process.exitCode = 1;
}
