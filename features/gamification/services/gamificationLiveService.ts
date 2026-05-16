// features/gamification/services/gamificationLiveService.ts
import { GamificationRequestSchema, GamificationResponseSchema, GamificationResponse } from "./gamificationSchema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deriveLevel } from "../gamificationCalculations";

export async function getGamificationData({
  userId,
  supabaseClient: _supabaseClient,
}: {
  userId: string;
  supabaseClient?: unknown;
}): Promise<GamificationResponse> {
  GamificationRequestSchema.parse({ userId });
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  if (!supabase) {
    const lvl = deriveLevel(0);
    return GamificationResponseSchema.parse({
      userId, xp: 0, streak: 0, timestamp: now,
      level: lvl.level, levelName: lvl.name,
      xpForCurrentLevel: lvl.xpForCurrentLevel, xpForNextLevel: lvl.xpForNextLevel,
      xpPct: lvl.xpPct, nextLevelName: lvl.nextLevelName,
    });
  }

  const { data } = await supabase
    .from("financial_profiles")
    .select("level_xp, streak_days")
    .eq("user_id", userId)
    .maybeSingle();

  const xp = Number(data?.level_xp ?? 0);
  const streak = Number(data?.streak_days ?? 0);
  const lvl = deriveLevel(xp);

  return GamificationResponseSchema.parse({
    userId, xp, streak, timestamp: now,
    level: lvl.level, levelName: lvl.name,
    xpForCurrentLevel: lvl.xpForCurrentLevel, xpForNextLevel: lvl.xpForNextLevel,
    xpPct: lvl.xpPct, nextLevelName: lvl.nextLevelName,
  });
}
