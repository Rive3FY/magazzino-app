import assert from "node:assert/strict";
import test from "node:test";
import { parseExcelQuantity, qtyAlreadyOnTotale, readTotaleQuantity, rebaseQtyToTotale } from "./excel-qty.ts";

test("legge TOTALE e conserva i movimenti già fatti sulla quantità vecchia", () => {
  const row = { TOTALE: "1.250,5", "Qnt. a Mag. libero": 40 };
  assert.equal(readTotaleQuantity(row), 1250.5);
  assert.equal(rebaseQtyToTotale(1250.5, 40, 35), 1245.5);
  assert.equal(qtyAlreadyOnTotale(1250.5, 1250.5), true);
});

test("senza colonna TOTALE non inventa una quantità", () => {
  assert.equal(readTotaleQuantity({ "Qnt. a Mag. libero": 8 }), null);
  assert.equal(parseExcelQuantity(""), null);
});
