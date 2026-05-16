import { z } from "zod";

const money = z.coerce.number().min(0).max(1_000_000);
const percent = z.coerce.number().min(0).max(100);
const uuid = z.string().uuid();

export const waitlistSchema = z.object({
  email: z.string().email().max(254),
  intent: z.string().max(120).optional(),
});

export const authEmailSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export const signUpSchema = authEmailSchema.extend({
  displayName: z.string().min(2).max(80),
});

export const moneyRealityCheckSchema = z.object({
  monthlyIncome: money,
  monthlyFixedExpenses: money,
  monthlyFlexibleExpenses: money,
  totalDebt: money,
  minimumDebtPayments: money,
  savingsBalance: money,
  goalName: z.string().min(2).max(120),
  goalMonthlyTarget: money,
});

export type MoneyRealityCheckInput = z.infer<typeof moneyRealityCheckSchema>;

export const debtUpdateSchema = z.object({
  id: uuid,
  balance: money,
  apr: percent.nullable().optional(),
  monthlyPayment: money,
});

export const debtScenarioSchema = z.object({
  extraPayment: money.max(10_000),
});

export const savingsContributionSchema = z.object({
  goalId: uuid,
  amount: money.min(0.01),
});

export const expenseUpdateSchema = z.object({
  id: uuid,
  planned: money,
  actual: money,
});

export const learningCompletionSchema = z.object({
  slug: z.string().min(2).max(120),
});

export const savingsGoalSchema = z.object({
  name: z.string().min(2).max(120),
  targetAmount: money.min(1),
  currentAmount: money.optional().default(0),
  monthlyContribution: money.optional().default(0),
  targetDate: z.string().nullable().optional().default(null),
});
