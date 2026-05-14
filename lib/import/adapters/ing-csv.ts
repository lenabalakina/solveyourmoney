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
