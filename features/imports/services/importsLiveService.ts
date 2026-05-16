import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImportsResponseSchema, ImportSessionSchema } from "./importsSchema";
import type { ImportsResponse, ImportSession } from "./importsSchema";

export async function getImports({
  userId,
}: {
  userId: string;
}): Promise<ImportsResponse> {
  const now = new Date().toISOString();
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return ImportsResponseSchema.parse({ userId, sessions: [], timestamp: now });
  }

  const { data, error } = await supabase
    .from("import_sessions")
    .select(
      "id, filename, source_type, transaction_count, saved_count, duplicate_count, status, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return ImportsResponseSchema.parse({ userId, sessions: [], timestamp: now });
  }

  const sessions = data.map((row) =>
    ImportSessionSchema.parse({
      id: row.id,
      filename: row.filename,
      sourceType: row.source_type,
      transactionCount: Number(row.transaction_count),
      savedCount: Number(row.saved_count),
      duplicateCount: Number(row.duplicate_count),
      status: row.status,
      createdAt: row.created_at,
    }),
  );

  return ImportsResponseSchema.parse({ userId, sessions, timestamp: now });
}

export async function getImportDetail({
  userId,
  importId,
}: {
  userId: string;
  importId: string;
}): Promise<ImportSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("import_sessions")
    .select(
      "id, filename, source_type, transaction_count, saved_count, duplicate_count, status, created_at",
    )
    .eq("id", importId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  return ImportSessionSchema.parse({
    id: data.id,
    filename: data.filename,
    sourceType: data.source_type,
    transactionCount: Number(data.transaction_count),
    savedCount: Number(data.saved_count),
    duplicateCount: Number(data.duplicate_count),
    status: data.status,
    createdAt: data.created_at,
  });
}
