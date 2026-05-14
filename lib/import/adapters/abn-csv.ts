import type { CsvAdapter, AdapterResult, RawTransaction } from "./types";

function parseAbnDate(d: string): string {
  if (/^\d{8}$/.test(d.trim())) {
    const s = d.trim();
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return d.trim();
}

function parseAmount(s: string): number {
  // ABN AMRO exports use European format: dot = thousands separator, comma = decimal
  // e.g. "1.234,56" → 1234.56, "954,80" → 954.80
  return parseFloat(s.trim().replace(/\./g, "").replace(",", ".")) || 0;
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
        const amount = Math.round(Math.abs(diff) * 100) / 100;
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
