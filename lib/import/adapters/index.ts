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
