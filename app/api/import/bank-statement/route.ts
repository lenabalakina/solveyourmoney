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
