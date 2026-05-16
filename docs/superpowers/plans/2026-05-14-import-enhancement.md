# Import Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the bank statement import flow to support CSV files, replace the fragile regex PDF parser with Claude AI extraction, and add basic deduplication to prevent re-importing the same transactions.

**Architecture:** The Next.js API route at `/api/import/bank-statement` is extended to branch on file type — CSV takes the PapaParse → adapter path, PDF takes the pdf-parse → AI extraction path with a regex fallback when no API key is set. The save action gains a duplicate check using existing Supabase columns. No schema changes required.

**Tech Stack:** Next.js 16 route handlers, `@anthropic-ai/sdk`, `papaparse`, Supabase, Node `assert` + `tsx` for tests.

---

## File Structure

**Create:**
- `lib/import/adapters/types.ts` — CsvAdapter interface + RawTransaction type
- `lib/import/adapters/abn-csv.ts` — ABN AMRO tab-separated CSV parser
- `lib/import/adapters/ing-csv.ts` — ING Netherlands CSV parser
- `lib/import/adapters/generic-csv.ts` — Fallback for any CSV with date/amount/description columns
- `lib/import/adapters/index.ts` — Adapter registry and `detectAdapter()` function
- `lib/import/extractTransactionsWithAI.ts` — Claude-powered PDF transaction extractor
- `tests/import/csvAdapters.test.ts` — Unit tests for all CSV adapters

**Modify:**
- `app/api/import/bank-statement/route.ts` — Branch on CSV vs PDF, replace regex with AI
- `server/actions/import.ts` — Add duplicate check before inserting expenses
- `app/(dashboard)/dashboard/import/import-content.tsx` — Show correct file type in progress UI + duplicate count in success message

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm install)
- Create: `.env.local`

- [ ] **Step 1: Read the Next.js 16 docs before writing any code**

Per AGENTS.md: open `node_modules/next/dist/docs/` and skim the Route Handlers section for any breaking changes before proceeding.

- [ ] **Step 2: Install packages**

```bash
npm install @anthropic-ai/sdk papaparse
npm install -D @types/papaparse
```

Expected: lock file updates, no peer-dep errors.

- [ ] **Step 3: Create .env.local**

Create `c:\Users\ghyor\OneDrive\Desktop\Projects\solveyourmoney\.env.local` with:

```
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

Replace `your-anthropic-api-key-here` with the real key from console.anthropic.com. This file is gitignored and must never be committed.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat(import): add @anthropic-ai/sdk and papaparse dependencies"
```

---

### Task 2: CSV adapter types and adapter files

**Files:**
- Create: `lib/import/adapters/types.ts`
- Create: `lib/import/adapters/abn-csv.ts`
- Create: `lib/import/adapters/ing-csv.ts`
- Create: `lib/import/adapters/generic-csv.ts`
- Create: `lib/import/adapters/index.ts`
- Test: `tests/import/csvAdapters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/import/csvAdapters.test.ts`:

```typescript
import assert from "assert";
import path from "path";

/* eslint-disable @typescript-eslint/no-require-imports */
function requireFresh(modulePath: string) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
  return require(modulePath);
}

const dir = path.join(__dirname, "..", "..", "lib", "import", "adapters");

// ABN AMRO: detect matches ABN headers
{
  const { abnCsvAdapter } = requireFresh(path.join(dir, "abn-csv.ts"));
  assert.strictEqual(
    abnCsvAdapter.detect(["Rekeningnummer", "Muntsoort", "Transactiedatum", "Beginsaldo", "Eindsaldo", "Omschrijving"]),
    true, "ABN: detects ABN headers"
  );
  assert.strictEqual(
    abnCsvAdapter.detect(["Date", "Description", "Amount"]),
    false, "ABN: rejects generic headers"
  );
}

// ABN AMRO: parse expense (begin > end = money out)
{
  const { abnCsvAdapter } = requireFresh(path.join(dir, "abn-csv.ts"));
  const rows = [{
    Rekeningnummer: "NL12ABNA0123456789",
    Muntsoort: "EUR",
    Transactiedatum: "20260501",
    Beginsaldo: "1.000,00",
    Eindsaldo: "954,80",
    Omschrijving: "Albert Heijn",
  }];
  const result = abnCsvAdapter.parse(rows);
  assert.strictEqual(result.transactions.length, 1, "ABN parse: one tx");
  assert.strictEqual(result.transactions[0].amount, 45.20, "ABN parse: correct amount");
  assert.strictEqual(result.transactions[0].direction_hint, "EXPENSE", "ABN parse: expense");
  assert.strictEqual(result.transactions[0].date, "2026-05-01", "ABN parse: date formatted");
}

// ABN AMRO: parse income (end > begin = money in)
{
  const { abnCsvAdapter } = requireFresh(path.join(dir, "abn-csv.ts"));
  const rows = [{
    Rekeningnummer: "NL12ABNA0123456789",
    Muntsoort: "EUR",
    Transactiedatum: "20260501",
    Beginsaldo: "954,80",
    Eindsaldo: "3.154,80",
    Omschrijving: "Salaris",
  }];
  const result = abnCsvAdapter.parse(rows);
  assert.strictEqual(result.transactions[0].direction_hint, "INCOME", "ABN parse: income");
  assert.strictEqual(result.transactions[0].amount, 2200, "ABN parse: income amount");
}

// ING: detect matches ING headers
{
  const { ingCsvAdapter } = requireFresh(path.join(dir, "ing-csv.ts"));
  assert.strictEqual(
    ingCsvAdapter.detect(["Datum", "Naam / Omschrijving", "Rekening", "Tegenrekening", "Code", "Af Bij", "Bedrag (EUR)", "MutatieSoort", "Mededelingen"]),
    true, "ING: detects ING headers"
  );
  assert.strictEqual(
    ingCsvAdapter.detect(["Date", "Description", "Amount"]),
    false, "ING: rejects generic headers"
  );
}

// ING: parse AF (expense)
{
  const { ingCsvAdapter } = requireFresh(path.join(dir, "ing-csv.ts"));
  const rows = [{
    "Datum": "20260501",
    "Naam / Omschrijving": "Albert Heijn",
    "Rekening": "NL12INGB0123456789",
    "Tegenrekening": "",
    "Code": "BA",
    "Af Bij": "Af",
    "Bedrag (EUR)": "45,20",
    "MutatieSoort": "Betaalautomaat",
    "Mededelingen": "boodschappen",
  }];
  const result = ingCsvAdapter.parse(rows);
  assert.strictEqual(result.transactions.length, 1, "ING parse: one tx");
  assert.strictEqual(result.transactions[0].amount, 45.20, "ING parse: correct amount");
  assert.strictEqual(result.transactions[0].direction_hint, "EXPENSE", "ING parse: Af = EXPENSE");
  assert.strictEqual(result.transactions[0].date, "2026-05-01", "ING parse: date formatted");
}

// ING: parse BIJ (income)
{
  const { ingCsvAdapter } = requireFresh(path.join(dir, "ing-csv.ts"));
  const rows = [{
    "Datum": "20260501",
    "Naam / Omschrijving": "Employer BV",
    "Af Bij": "Bij",
    "Bedrag (EUR)": "2.200,00",
    "Mededelingen": "salaris",
  }];
  const result = ingCsvAdapter.parse(rows);
  assert.strictEqual(result.transactions[0].direction_hint, "INCOME", "ING parse: Bij = INCOME");
  assert.strictEqual(result.transactions[0].amount, 2200, "ING parse: income amount");
}

// Generic: always detects
{
  const { genericCsvAdapter } = requireFresh(path.join(dir, "generic-csv.ts"));
  assert.strictEqual(genericCsvAdapter.detect([]), true, "Generic: always detects");
}

// Generic: parse with standard columns
{
  const { genericCsvAdapter } = requireFresh(path.join(dir, "generic-csv.ts"));
  const rows = [{ "Date": "2026-05-01", "Description": "Coffee Shop", "Amount": "-3.50" }];
  const result = genericCsvAdapter.parse(rows);
  assert.strictEqual(result.transactions.length, 1, "Generic parse: one tx");
  assert.strictEqual(result.transactions[0].amount, 3.50, "Generic parse: correct amount");
  assert.strictEqual(result.transactions[0].direction_hint, "EXPENSE", "Generic parse: negative = EXPENSE");
}

// Generic: empty file → errors, no transactions
{
  const { genericCsvAdapter } = requireFresh(path.join(dir, "generic-csv.ts"));
  const result = genericCsvAdapter.parse([]);
  assert.strictEqual(result.transactions.length, 0, "Generic parse: empty = no transactions");
  assert.ok(result.errors.length > 0, "Generic parse: empty = has errors");
}

// detectAdapter: ING headers → ING adapter
{
  const { detectAdapter } = requireFresh(path.join(dir, "index.ts"));
  const adapter = detectAdapter(["Datum", "Af Bij", "Bedrag (EUR)"]);
  assert.strictEqual(adapter.name, "ING (NL)", "detectAdapter: ING headers → ING");
}

// detectAdapter: ABN headers → ABN adapter
{
  const { detectAdapter } = requireFresh(path.join(dir, "index.ts"));
  const adapter = detectAdapter(["Rekeningnummer", "Transactiedatum", "Beginsaldo", "Eindsaldo"]);
  assert.strictEqual(adapter.name, "ABN AMRO (NL)", "detectAdapter: ABN headers → ABN");
}

// detectAdapter: unknown headers → generic fallback
{
  const { detectAdapter } = requireFresh(path.join(dir, "index.ts"));
  const adapter = detectAdapter(["Date", "Payee", "Amount"]);
  assert.strictEqual(adapter.name, "Generic CSV", "detectAdapter: unknown → generic");
}

console.log("All CSV adapter tests passed");
```

- [ ] **Step 2: Run test to verify it fails (modules not found)**

```bash
npx tsx tests/import/csvAdapters.test.ts
```

Expected: `Error: Cannot find module '...lib/import/adapters/abn-csv.ts'`

- [ ] **Step 3: Create `lib/import/adapters/types.ts`**

```typescript
export interface RawTransaction {
  date: string;
  amount: number;
  currency: string;
  description_raw: string;
  direction_hint: "INCOME" | "EXPENSE" | null;
  account_iban?: string;
}

export interface AdapterResult {
  transactions: RawTransaction[];
  source_name: string;
  errors: string[];
}

export interface CsvAdapter {
  name: string;
  detect(headers: string[]): boolean;
  parse(rows: Record<string, string>[]): AdapterResult;
}
```

- [ ] **Step 4: Create `lib/import/adapters/abn-csv.ts`**

```typescript
import type { CsvAdapter, AdapterResult, RawTransaction } from "./types";

function parseAbnDate(d: string): string {
  if (/^\d{8}$/.test(d.trim())) {
    const s = d.trim();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return d.trim();
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".").trim()) || 0;
}

export const abnCsvAdapter: CsvAdapter = {
  name: "ABN AMRO (NL)",

  detect(headers: string[]): boolean {
    const h = headers.map((x) => x.toLowerCase().replace(/\s/g, ""));
    return h.includes("rekeningnummer") || h.includes("transactiedatum");
  },

  parse(rows: Record<string, string>[]): AdapterResult {
    const transactions: RawTransaction[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const accountKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("rekeningnummer")
        );
        const currencyKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("muntsoort")
        );
        const dateKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("transactiedatum")
        );
        const startKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("beginsaldo")
        );
        const endKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("eindsaldo")
        );
        const descKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("omschrijving")
        );

        if (!dateKey || !startKey || !endKey) {
          errors.push(`Row ${i + 1}: missing required columns`);
          continue;
        }

        const date = parseAbnDate(row[dateKey] ?? "");
        const start = parseAmount(row[startKey] ?? "0");
        const end = parseAmount(row[endKey] ?? "0");
        const diff = end - start;
        const amount = Math.abs(diff);
        const currency = currencyKey ? (row[currencyKey] ?? "EUR").trim() : "EUR";
        const description_raw = descKey ? (row[descKey] ?? "").trim() : "";

        if (!date || amount === 0) {
          errors.push(`Row ${i + 1}: invalid date or zero amount`);
          continue;
        }

        const direction_hint: "INCOME" | "EXPENSE" | null =
          diff > 0 ? "INCOME" : diff < 0 ? "EXPENSE" : null;

        transactions.push({
          date,
          amount,
          currency,
          description_raw,
          direction_hint,
          account_iban: accountKey ? (row[accountKey] ?? "").trim() : undefined,
        });
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e}`);
      }
    }

    return { transactions, source_name: "ABN AMRO", errors };
  },
};
```

- [ ] **Step 5: Create `lib/import/adapters/ing-csv.ts`**

```typescript
import type { CsvAdapter, AdapterResult, RawTransaction } from "./types";

function parseIngDate(d: string): string {
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return d;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

export const ingCsvAdapter: CsvAdapter = {
  name: "ING (NL)",

  detect(headers: string[]): boolean {
    const h = headers.map((x) => x.toLowerCase().replace(/[^a-z/]/g, ""));
    return h.includes("datum") && h.some((x) => x.includes("afbij"));
  },

  parse(rows: Record<string, string>[]): AdapterResult {
    const transactions: RawTransaction[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const dateKey = Object.keys(row).find((k) => k.toLowerCase().includes("datum"));
        const nameKey = Object.keys(row).find((k) => k.toLowerCase().includes("naam"));
        const accountKey = Object.keys(row).find((k) => k.toLowerCase() === "rekening");
        const directionKey = Object.keys(row).find((k) =>
          k.toLowerCase().replace(/\s/g, "").includes("afbij")
        );
        const amountKey = Object.keys(row).find((k) => k.toLowerCase().includes("bedrag"));
        const notesKey = Object.keys(row).find((k) => k.toLowerCase().includes("mededelingen"));

        if (!dateKey || !amountKey) {
          errors.push(`Row ${i + 1}: missing required columns`);
          continue;
        }

        const date = parseIngDate((row[dateKey] ?? "").trim());
        const amount = parseAmount((row[amountKey] ?? "0").trim());
        const directionRaw = directionKey ? (row[directionKey] ?? "").trim().toLowerCase() : "";
        const direction_hint: "INCOME" | "EXPENSE" | null =
          directionRaw === "bij" ? "INCOME" : directionRaw === "af" ? "EXPENSE" : null;
        const name = nameKey ? (row[nameKey] ?? "").trim() : "";
        const notes = notesKey ? (row[notesKey] ?? "").trim() : "";
        const description_raw = [name, notes].filter(Boolean).join(" — ");

        if (!date || amount === 0) {
          errors.push(`Row ${i + 1}: invalid date or zero amount`);
          continue;
        }

        transactions.push({
          date,
          amount,
          currency: "EUR",
          description_raw,
          direction_hint,
          account_iban: accountKey ? (row[accountKey] ?? "").trim() : undefined,
        });
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e}`);
      }
    }

    return { transactions, source_name: "ING", errors };
  },
};
```

- [ ] **Step 6: Create `lib/import/adapters/generic-csv.ts`**

```typescript
import type { CsvAdapter, AdapterResult, RawTransaction } from "./types";

const DATE_KEYS = ["date", "datum", "transactiedatum", "transaction date", "boekdatum", "data", "fecha"];
const AMOUNT_KEYS = ["amount", "bedrag", "betrag", "montant", "importe", "value", "sum", "debit", "credit"];
const DESC_KEYS = ["description", "omschrijving", "beschreibung", "descripcion", "narration", "details", "memo", "reference", "naam"];
const DIRECTION_KEYS = ["type", "af bij", "af/bij", "direction", "cr/dr", "debit/credit", "sign"];

function matchKey(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c)));
}

function parseDate(raw: string): string {
  const s = raw.trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(s)) {
    const [d, m, y] = s.split(/[/-]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}[/-]\d{2}[/-]\d{2}$/.test(s)) return s.replace(/\//g, "-");
  return s;
}

function parseAmount(s: string): number {
  return parseFloat(s.replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;
}

export const genericCsvAdapter: CsvAdapter = {
  name: "Generic CSV",

  detect(_headers: string[]): boolean {
    return true;
  },

  parse(rows: Record<string, string>[]): AdapterResult {
    const transactions: RawTransaction[] = [];
    const errors: string[] = [];

    if (rows.length === 0) return { transactions, source_name: "Unknown", errors: ["Empty file"] };

    const headers = Object.keys(rows[0]);
    const dateKey = matchKey(headers, DATE_KEYS);
    const amountKey = matchKey(headers, AMOUNT_KEYS);
    const descKey = matchKey(headers, DESC_KEYS);
    const dirKey = matchKey(headers, DIRECTION_KEYS);

    if (!dateKey) errors.push("Could not detect date column");
    if (!amountKey) errors.push("Could not detect amount column");

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (!dateKey || !amountKey) {
          errors.push(`Row ${i + 1}: skipped — missing column mapping`);
          continue;
        }

        const date = parseDate(row[dateKey] ?? "");
        const rawAmountStr = row[amountKey] ?? "0";
        const amount = Math.abs(parseAmount(rawAmountStr));
        const description_raw = descKey ? (row[descKey] ?? "").trim() : Object.values(row).join(" ");

        if (!date || amount === 0) {
          errors.push(`Row ${i + 1}: invalid date or zero amount`);
          continue;
        }

        let direction_hint: "INCOME" | "EXPENSE" | null = null;
        if (dirKey) {
          const d = (row[dirKey] ?? "").toLowerCase();
          if (["bij", "credit", "cr", "in", "+"].some((k) => d.includes(k))) direction_hint = "INCOME";
          else if (["af", "debit", "dr", "out", "-"].some((k) => d.includes(k))) direction_hint = "EXPENSE";
        }
        if (!direction_hint && parseAmount(rawAmountStr) < 0) direction_hint = "EXPENSE";

        transactions.push({ date, amount, currency: "EUR", description_raw, direction_hint });
      } catch (e) {
        errors.push(`Row ${i + 1}: ${e}`);
      }
    }

    return { transactions, source_name: "CSV Import", errors };
  },
};
```

- [ ] **Step 7: Create `lib/import/adapters/index.ts`**

```typescript
import type { CsvAdapter } from "./types";
import { ingCsvAdapter } from "./ing-csv";
import { abnCsvAdapter } from "./abn-csv";
import { genericCsvAdapter } from "./generic-csv";

const adapters: CsvAdapter[] = [ingCsvAdapter, abnCsvAdapter, genericCsvAdapter];

export function detectAdapter(headers: string[]): CsvAdapter {
  for (const adapter of adapters) {
    if (adapter !== genericCsvAdapter && adapter.detect(headers)) {
      return adapter;
    }
  }
  return genericCsvAdapter;
}
```

- [ ] **Step 8: Run tests and verify all pass**

```bash
npx tsx tests/import/csvAdapters.test.ts
```

Expected output: `All CSV adapter tests passed`

- [ ] **Step 9: Commit**

```bash
git add lib/import/adapters/ tests/import/csvAdapters.test.ts
git commit -m "feat(import): add CSV adapters for ABN AMRO, ING, and generic CSV"
```

---

### Task 3: AI PDF extractor

**Files:**
- Create: `lib/import/extractTransactionsWithAI.ts`

- [ ] **Step 1: Create `lib/import/extractTransactionsWithAI.ts`**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/import/extractTransactionsWithAI.ts
git commit -m "feat(import): add AI-powered PDF transaction extractor using Claude"
```

---

### Task 4: Update API route to handle CSV + AI PDF

**Files:**
- Modify: `app/api/import/bank-statement/route.ts`

- [ ] **Step 1: Read the current route before editing**

Read `app/api/import/bank-statement/route.ts` in full.

- [ ] **Step 2: Rewrite the route**

Replace the entire contents of `app/api/import/bank-statement/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOptionalSession } from "@/server/dal/session";
import { detectAdapter } from "@/lib/import/adapters";
import type { ParsedTransaction } from "@/lib/import/parseBankStatement";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MIN_TEXT_LENGTH = 50;
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]);

export async function POST(request: NextRequest) {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10 MB." },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10 MB." },
      { status: 413 },
    );
  }

  const filename = file.name.toLowerCase();

  if (filename.endsWith(".csv")) {
    return handleCsv(buffer);
  }

  if (filename.endsWith(".pdf") || file.type === "application/pdf") {
    return handlePdf(buffer);
  }

  return NextResponse.json(
    { error: "Only PDF and CSV files are supported." },
    { status: 415 },
  );
}

async function handleCsv(buffer: Buffer): Promise<NextResponse> {
  const content = buffer.toString("utf-8");
  const Papa = (await import("papaparse")).default;

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    delimiter: "",
    transformHeader: (h: string) => h.trim().replace(/^"/, "").replace(/"$/, ""),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: "Could not parse CSV file." }, { status: 400 });
  }

  const headers = parsed.meta.fields ?? [];
  const adapter = detectAdapter(headers);
  const result = adapter.parse(parsed.data);

  const transactions: ParsedTransaction[] = result.transactions.map((t) => ({
    date: t.date,
    description: t.description_raw,
    amount: t.amount,
    type: t.direction_hint === "INCOME" ? "credit" : "debit",
  }));

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: result.errors.length > 0 ? result.errors[0] : "No transactions found in CSV." },
      { status: 422 },
    );
  }

  return NextResponse.json({ transactions });
}

async function handlePdf(buffer: Buffer): Promise<NextResponse> {
  if (buffer.length < 4 || !buffer.slice(0, 4).equals(PDF_MAGIC)) {
    return NextResponse.json({ error: "Only PDF files are supported" }, { status: 415 });
  }

  const g = globalThis as Record<string, unknown>;
  if (!g.DOMMatrix) g.DOMMatrix = class {};
  if (!g.ImageData) g.ImageData = class {};
  if (!g.Path2D) g.Path2D = class {};

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

  let parsed: { text: string };
  try {
    parsed = await pdfParse(buffer);
  } catch {
    return NextResponse.json({ error: "Could not read this PDF file." }, { status: 422 });
  }

  if (!parsed.text || parsed.text.trim().length < MIN_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error:
          "This looks like a scanned PDF. Please download your statement as a digital export from your bank's website.",
      },
      { status: 422 },
    );
  }

  let transactions: ParsedTransaction[];

  try {
    const { extractTransactionsWithAI } = await import(
      "@/lib/import/extractTransactionsWithAI"
    );
    transactions = await extractTransactionsWithAI(parsed.text);
  } catch {
    // Fall back to regex parser when API key is missing or AI call fails
    const { parseBankStatement } = await import("@/lib/import/parseBankStatement");
    transactions = parseBankStatement(parsed.text);
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      {
        error:
          "We couldn't read transactions from this file. Try a different export format.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ transactions });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/api/import/bank-statement/route.ts"
git commit -m "feat(import): support CSV uploads and use AI extraction for PDFs"
```

---

### Task 5: Deduplication in save action

**Files:**
- Modify: `server/actions/import.ts`
- Modify: `app/(dashboard)/dashboard/import/import-content.tsx`

- [ ] **Step 1: Read the current save action before editing**

Read `server/actions/import.ts` in full.

- [ ] **Step 2: Rewrite `server/actions/import.ts` with duplicate check**

Replace the entire contents of `server/actions/import.ts` with:

```typescript
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
});

type SaveResult =
  | { ok: true; count: number; duplicates: number }
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

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/debt");
  revalidatePath("/dashboard/budget");
  revalidatePath("/dashboard/savings");

  return { ok: true, count: savedCount, duplicates: duplicateCount };
}
```

- [ ] **Step 3: Update the success message in `import-content.tsx` to show duplicate count**

In `app/(dashboard)/dashboard/import/import-content.tsx`, find this line in `handleAccept`:

```typescript
setSaveResult({ ok: true, message: `${result.count} transaction${result.count === 1 ? "" : "s"} saved to your dashboard.` });
```

Replace it with:

```typescript
const dupNote = result.duplicates > 0 ? ` (${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"} skipped)` : "";
setSaveResult({ ok: true, message: `${result.count} transaction${result.count === 1 ? "" : "s"} saved to your dashboard.${dupNote}` });
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "server/actions/import.ts" "app/(dashboard)/dashboard/import/import-content.tsx"
git commit -m "feat(import): skip duplicate expenses on re-import and show count"
```

---

### Task 6: Update progress UI to show correct file type

**Files:**
- Modify: `app/(dashboard)/dashboard/import/import-content.tsx`

- [ ] **Step 1: Add `fileExt` state**

In `ImportContent`, find the existing state declarations (around line 224):

```typescript
const [fileName, setFileName] = useState("");
```

Add directly after it:

```typescript
const [fileExt, setFileExt] = useState("FILE");
```

- [ ] **Step 2: Set `fileExt` when a file is selected**

In `handleFile`, find `setFileName(file.name);` and add the following line immediately after:

```typescript
setFileExt(file.name.split(".").pop()?.toUpperCase() ?? "FILE");
```

- [ ] **Step 3: Reset `fileExt` on cancel**

In `handleCancel`, add after the existing resets:

```typescript
setFileExt("FILE");
```

- [ ] **Step 4: Use `fileExt` in the progress SVG**

Find the hardcoded `PDF` text in the SVG element inside the uploading/parsing stage:

```jsx
<text x="12" y="16" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill="oklch(0.98 0 0)">PDF</text>
```

Replace with:

```jsx
<text x="12" y="16" textAnchor="middle" fontSize="6.5" fontFamily="var(--font-mono)" fill="oklch(0.98 0 0)">{fileExt}</text>
```

- [ ] **Step 5: Use `fileExt` in the import history source label**

In `handleAccept`, find:

```typescript
source: "Bank PDF",
```

Replace with:

```typescript
source: fileExt === "CSV" ? "CSV" : "Bank PDF",
```

- [ ] **Step 6: Verify TypeScript compiles and existing tests pass**

```bash
npx tsc --noEmit && npx tsx tests/run-tests.ts
```

Expected: no errors, `All tests passed (lightweight)`

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/dashboard/import/import-content.tsx"
git commit -m "fix(import): show correct file extension label in upload progress"
```

---

## Self-Review

**Spec coverage:**
- Fix PDF extraction (replace regex with AI) → Task 3 creates extractor, Task 4 `handlePdf` uses it with regex fallback ✓
- Add CSV support → Task 2 (adapters) + Task 4 `handleCsv` ✓
- Add deduplication → Task 5 duplicate check in save action ✓

**Placeholder scan:** All code blocks are complete and runnable. No TBD, no "handle edge cases", no "similar to Task N".

**Type consistency:**
- `ParsedTransaction` from `lib/import/parseBankStatement.ts` is the shared output type used in `route.ts`, `extractTransactionsWithAI.ts`, and the CSV handler ✓
- `CsvAdapter`, `RawTransaction`, `AdapterResult` from `adapters/types.ts` are imported by name in all three adapter files ✓
- `SaveResult` union type gains `duplicates: number` in Task 5; `import-content.tsx` reads `result.duplicates` in the same task ✓
