"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/server/dal/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; message: string };

export async function deleteImportSession(
  importId: string,
): Promise<ActionResult> {
  if (!importId || typeof importId !== "string") {
    return { ok: false, message: "Import ID is required." };
  }

  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Data storage is not configured yet." };
  }

  const { error } = await supabase
    .from("import_sessions")
    .delete()
    .eq("id", importId)
    .eq("user_id", session.userId);

  if (error) {
    return { ok: false, message: "This import record could not be removed." };
  }

  revalidatePath("/dashboard/import");
  return { ok: true };
}
