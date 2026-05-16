"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/dal/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const assignedTransactionSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  type: z.enum(["credit", "debit"]),
  assignment: z.enum(["debt_payment", "expense", "savings", "ignore"]),
  targetId: z.string().optional(),
  targetLabel: z.string().optional(),
});

const saveImportSchema = z.object({
  transactions: z.array(assignedTransactionSchema),
  filename: z.string().optional(),
  sourceType: z.string().optional(),
});

type SaveResult =
  | { ok: true; count: number; duplicates: number; importSessionId: string }
  | { ok: false; message: string };

export async function saveImportedTransactions(
  input: unknown,
): Promise<SaveResult> {
  const session = await requireSession();

  const parsed = saveImportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Transaction data is not valid." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, message: "Data storage is not configured yet." };
  }

  const toSave = parsed.data.transactions.filter(
    (t) => t.assignment !== "ignore",
  );
  let savedCount = 0;
  let duplicateCount = 0;

  for (const tx of toSave) {
    if (tx.assignment === "expense") {
      const today = new Date();
      const periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split("T")[0];

      if (tx.targetId) {
        await supabase
          .from("expenses")
          .update({
            actual_amount: tx.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      } else {
        const { data: dup } = await supabase
          .from("expenses")
          .select("id")
          .eq("user_id", session.userId)
          .eq("category", tx.targetLabel ?? tx.description)
          .eq("actual_amount", tx.amount)
          .eq("period_start", periodStart)
          .maybeSingle();

        if (dup) {
          duplicateCount++;
          continue;
        }

        await supabase.from("expenses").insert({
          user_id: session.userId,
          category: tx.targetLabel ?? tx.description,
          period_start: periodStart,
          planned_amount: tx.amount,
          actual_amount: tx.amount,
        });
        savedCount++;
      }
    } else if (tx.assignment === "debt_payment" && tx.targetId) {
      const { data: debt } = await supabase
        .from("debts")
        .select("balance")
        .eq("id", tx.targetId)
        .eq("user_id", session.userId)
        .maybeSingle();

      if (debt) {
        await supabase
          .from("debts")
          .update({
            balance: Math.max(0, Number(debt.balance) - tx.amount),
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      }
    } else if (tx.assignment === "savings" && tx.targetId) {
      const { data: goal } = await supabase
        .from("savings_goals")
        .select("saved_amount")
        .eq("id", tx.targetId)
        .eq("user_id", session.userId)
        .maybeSingle();

      if (goal) {
        await supabase
          .from("savings_goals")
          .update({
            saved_amount: Number(goal.saved_amount) + tx.amount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", tx.targetId)
          .eq("user_id", session.userId);
        savedCount++;
      }
    }
  }

  // Record the import session for history tracking
  const filename = parsed.data.filename ?? "upload";
  const sourceType = parsed.data.sourceType ?? "CSV";
  const totalCount = parsed.data.transactions.length;
  const status = savedCount > 0 ? "complete" : (totalCount > 0 ? "partial" : "complete");

  const { data: importSession } = await supabase
    .from("import_sessions")
    .insert({
      user_id: session.userId,
      filename,
      source_type: sourceType,
      transaction_count: totalCount,
      saved_count: savedCount,
      duplicate_count: duplicateCount,
      status,
    })
    .select("id")
    .single();

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/debt");
  revalidatePath("/dashboard/budget");
  revalidatePath("/dashboard/savings");
  revalidatePath("/dashboard/import");

  return {
    ok: true,
    count: savedCount,
    duplicates: duplicateCount,
    importSessionId: importSession?.id ?? "",
  };
}
