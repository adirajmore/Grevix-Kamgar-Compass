import assert from "node:assert/strict";
import test from "node:test";
import { generateFunderPack } from "../src/funderPack.js";
import { calculateProject, calculateReservePlan } from "../src/engine.js";
import { makeProject, makeSampleProject, rulesData } from "./fixtures.js";

const basicTranslate = (key, replacements = {}) =>
  Object.entries(replacements).reduce(
    (value, [name, replacement]) =>
      value.replaceAll(`{${name}}`, String(replacement)),
    key
  );

test("Funder Pack includes cost lines, grant, law sources, and verification caveat", () => {
  const project = makeSampleProject();
  const calculation = calculateProject(project, rulesData);
  const note = generateFunderPack(
    project,
    rulesData,
    calculation,
    (key) =>
      ({
        "dashboard.grantAmount": "Total grant amount",
        "notice.disclaimer": "not a legal determination"
      })[key] || key,
    (amount) => `₹${amount}`
  );
  assert.match(note, /Total grant amount/);
  assert.match(note, /illustrative employer costs/);
  assert.match(
    note,
    /Employees' Provident Funds and Miscellaneous Provisions Act/
  );
  assert.match(note, /TO VERIFY/);
  assert.match(note, /not a legal determination/);
});

test("cautious Funder Pack explains unquantifiable uncertainty and verification", () => {
  const project = makeSampleProject();
  const calculation = calculateProject(project, rulesData, {
    asOfDate: "2026-10-11"
  });
  const note = generateFunderPack(
    project,
    rulesData,
    calculation,
    (key, replacements) =>
      ({
        "funder.basisHeading": "Basis of estimate",
        "funder.rulesSnapshot": "Rules snapshot date",
        "funder.estimateDate": "Estimate as of",
        "funder.recommendedEstimate": "Recommended budget figure",
        "funder.recommendationUnavailable": "Not available",
        "funder.uncertaintyUnquantifiable": "Cannot bound uncertainty",
        "funder.cautiousStatement": "Deliberately conservative",
        "funder.verifyBeforeSubmission": "Verify before submission",
        "funder.reconciliation": "Import a newer pack and regenerate"
      })[key] || basicTranslate(key, replacements),
    (amount) => `₹${amount}`
  );
  assert.match(note, /Basis of estimate/);
  assert.match(note, /Rules snapshot date: 2026-10-11/);
  assert.match(note, /Recommended budget figure: Not available/);
  assert.match(note, /Cannot bound uncertainty/);
  assert.match(note, /Deliberately conservative/);
  assert.match(note, /Verify before submission/);
  assert.match(note, /Import a newer pack and regenerate/);
});

test("Funder Pack reports partial-range reconciliation without claiming full coverage", () => {
  const project = makeSampleProject();
  const calculation = calculateProject(project, rulesData, {
    asOfDate: "2026-10-11",
    forceCautious: true
  });
  const note = generateFunderPack(
    project,
    rulesData,
    calculation,
    (key, replacements = {}) =>
      basicTranslate(
        {
          "funder.reconciliationResult":
            "Expected {expected}; earlier range {low}-{high}; change {difference}. {coverage}",
          "funder.reconciliationWithin":
            "Within quantified range, but {bounded}.",
          "funder.reconciliationUnbounded": "full range remains unproven"
        }[key] || key,
        replacements
      ),
    (amount) => `₹${amount}`,
    "en",
    {
      expected: 258714,
      low: 258714,
      high: 258714,
      difference: 0,
      withinQuantifiedRange: true,
      fullRangeBounded: false
    }
  );
  assert.match(note, /Within quantified range/);
  assert.match(note, /full range remains unproven/);
  assert.match(note, /change ₹0/);
});

test("fresh-mode Funder Pack does not add the uncertainty section", () => {
  const project = makeProject(
    { grantDurationMonths: 2 },
    {
      headcount: 1,
      contractType: "volunteer_stipend",
      endMonth: 2
    }
  );
  const freshRules = {
    ...rulesData,
    rules: rulesData.rules.map((rule) => ({
      ...setVerificationDate(rule, "2026-10-10")
    }))
  };
  const calculation = calculateProject(project, freshRules, {
    asOfDate: "2026-10-11"
  });
  const note = generateFunderPack(
    project,
    freshRules,
    calculation,
    basicTranslate,
    (amount) => `₹${amount}`
  );
  assert.doesNotMatch(note, /Basis of estimate/);
});

test("Funder Pack includes reserve set-aside and preserves an unbounded high estimate", () => {
  const project = makeSampleProject();
  const calculation = calculateProject(project, rulesData, {
    asOfDate: "2026-10-11",
    forceCautious: true
  });
  const reservePlan = calculateReservePlan(
    calculation.cliff,
    { low: 1000, expected: 1500, high: null },
    { monthsRemaining: 6, asOfDate: "2026-10-11" }
  );
  const note = generateFunderPack(
    project,
    rulesData,
    calculation,
    (key, replacements = {}) =>
      key === "reserve.funderLine"
        ? `Reserve line: ${replacements.monthly} for ${replacements.months} months; total ${replacements.total}; high ${replacements.high}`
        : basicTranslate(key, replacements),
    (amount) => `₹${amount}`,
    "en",
    null,
    reservePlan
  );
  assert.match(
    note,
    /Reserve line: ₹250 for 6 months; total ₹1500; high dashboard\.rangeUnbounded/
  );
});

function setVerificationDate(value, date) {
  if (Array.isArray(value)) {
    return value.map((item) => setVerificationDate(item, date));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === "last_verified" ? date : setVerificationDate(child, date)
    ])
  );
}
