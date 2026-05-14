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
