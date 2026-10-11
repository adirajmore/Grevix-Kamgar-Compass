import assert from "node:assert/strict";
import test from "node:test";
import { rulesData, makeSampleProject } from "./fixtures.js";
import {
  getApplicationState,
  initializeState,
  removeScenario,
  saveScenario,
  setFreshnessOptions
} from "../src/state.js";

test("freshness controls recalculate without mutating the bundled rules", () => {
  initializeState(makeSampleProject(), rulesData, "en", ["en-US"]);
  const updated = setFreshnessOptions({
    asOfDate: "2026-10-11",
    verifiedOnDate: "2026-10-10",
    limitedInformation: false
  });
  assert.equal(updated.asOfDate, "2026-10-11");
  assert.equal(updated.verifiedOnDate, "2026-10-10");
  assert.equal(updated.rulesData.rules[0].last_verified, "2026-10-10");
  assert.equal(
    updated.rulesData.rules[0].applies_if.minimum_headcount.last_verified,
    "2026-10-10"
  );
  assert.equal(rulesData.rules[0].last_verified, "TO VERIFY");
  assert.equal(updated.calculation.uncertainty.mode, "cautious");
  assert.ok(
    updated.calculation.uncertainty.unquantifiableRuleIds.includes(
      "minimum_wage_check"
    )
  );
  assert.equal(updated.calculation.uncertainty.costs.high, null);
});

test("limited-information selection persists through state recalculation", () => {
  initializeState(makeSampleProject(), rulesData, "en", ["en-US"]);
  setFreshnessOptions({
    asOfDate: "2026-10-11",
    verifiedOnDate: "2026-10-10",
    limitedInformation: true
  });
  const state = getApplicationState();
  assert.equal(state.limitedInformation, true);
  assert.equal(state.calculation.uncertainty.mode, "cautious");
  assert.equal(
    state.calculation.uncertainty.costs.quantified.low,
    state.calculation.uncertainty.costs.quantified.high
  );
  assert.equal(state.calculation.uncertainty.costs.high, null);
  assert.ok(
    state.calculation.uncertainty.unquantifiableRuleIds.includes(
      "minimum_wage_check"
    )
  );
});

test("invalid as-of dates are rejected instead of silently ignored", () => {
  initializeState(makeSampleProject(), rulesData, "en", ["en-US"]);
  assert.throws(
    () =>
      setFreshnessOptions({
        asOfDate: "2026-02-30",
        verifiedOnDate: "",
        limitedInformation: false
      }),
    TypeError
  );
});

test("saved scenarios are named project snapshots capped at three", () => {
  const project = makeSampleProject();
  initializeState(project, rulesData, "en", ["en-US"]);
  saveScenario("Current setup");
  project.name = "Changed after save";
  const updated = saveScenario("Alternative");
  assert.equal(updated.savedScenarios.length, 2);
  assert.equal(
    updated.savedScenarios[0].project.name,
    "Women's Livelihoods Project"
  );
  assert.notEqual(updated.savedScenarios[0].id, updated.savedScenarios[1].id);
  saveScenario("Third option");
  assert.throws(() => saveScenario("Fourth option"), RangeError);
  const remaining = removeScenario(updated.savedScenarios[0].id);
  assert.equal(remaining.savedScenarios.length, 2);
  assert.equal(
    remaining.savedScenarios.some(
      (scenario) => scenario.name === "Current setup"
    ),
    false
  );
});

test("saving a scenario requires a name and a valid current project", () => {
  initializeState(makeSampleProject(), rulesData, "en", ["en-US"]);
  assert.throws(() => saveScenario("  "), /name/);
  assert.throws(() => saveScenario("x".repeat(81)), /80 characters/);
});
