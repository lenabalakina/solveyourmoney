import { z } from "zod";

export const ImportSessionSchema = z.object({
  id: z.string(),
  filename: z.string(),
  sourceType: z.string(),
  transactionCount: z.number(),
  savedCount: z.number(),
  duplicateCount: z.number(),
  status: z.enum(["complete", "partial", "failed"]),
  createdAt: z.string(),
});

export const ImportsResponseSchema = z.object({
  userId: z.string(),
  sessions: z.array(ImportSessionSchema),
  timestamp: z.string(),
});

export type ImportSession = z.infer<typeof ImportSessionSchema>;
export type ImportsResponse = z.infer<typeof ImportsResponseSchema>;
