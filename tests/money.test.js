import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "../money.js";

test("money uses Indian lakh/crore grouping and Latin digits", () => {
  const formatted = formatMoney(123456789);
  assert.match(formatted, /12,34,56,789/);
  assert.doesNotMatch(formatted, /[०-९]/);
});
