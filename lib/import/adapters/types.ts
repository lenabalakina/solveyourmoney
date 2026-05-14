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
