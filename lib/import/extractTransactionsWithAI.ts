import Anthropic from "@anthropic-ai/sdk";
import type { ParsedTransaction } from "./parseBankStatement";

interface AiTransaction {
  date: string;
  description: string;
  merchant_name: string;
  amount: number;
  direction: "INCOME" | "EXPENSE";
}

interface AiExtractionResult {
  transactions: AiTransaction[];
  errors: string[];
}

export async function extractTransactionsWithAI(
  text: string,
): Promise<ParsedTransaction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: `You are an expert financial data extractor. Extract every transaction from the bank statement with perfect accuracy.

Rules:
- amount is always a positive number
- direction: INCOME = money received into account, EXPENSE = money leaving account
- merchant_name: clean, human-readable name (e.g. "Albert Heijn" not "ALBERT HEIJN 2225 DELFT NLD Apple Pay Term CT925999")
- Remove payment method noise: iDEAL, SEPA, Apple Pay, card numbers, terminal IDs, reference numbers
- Date always in YYYY-MM-DD format
- Dutch/European amounts: comma is decimal separator (1.234,56 = 1234.56)`,
    tools: [
      {
        name: "extract_transactions",
        description: "Extract all transactions from the bank statement",
        input_schema: {
          type: "object" as const,
          properties: {
            transactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  date: { type: "string", description: "YYYY-MM-DD format" },
                  merchant_name: { type: "string", description: "Clean merchant name" },
                  description: { type: "string", description: "Full raw description" },
                  amount: { type: "number", description: "Always positive" },
                  direction: { type: "string", enum: ["INCOME", "EXPENSE"] },
                },
                required: ["date", "merchant_name", "description", "amount", "direction"],
              },
            },
            errors: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["transactions", "errors"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "extract_transactions" },
    messages: [
      {
        role: "user",
        content: `Extract all transactions from this bank statement:\n\n${text}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return structured data");
  }

  const input = toolUse.input as AiExtractionResult;

  return (input.transactions ?? [])
    .filter((t) => t.date && t.amount != null)
    .map((t) => ({
      date: t.date,
      description: t.merchant_name || t.description,
      amount: Math.abs(t.amount),
      type: t.direction === "INCOME" ? ("credit" as const) : ("debit" as const),
    }));
}
