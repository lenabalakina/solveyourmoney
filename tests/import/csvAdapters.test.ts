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
