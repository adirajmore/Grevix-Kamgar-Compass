import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateProject } from "../src/engine.js";
import { validateProject } from "../src/validation.js";
import {
  calculatePackChecksum,
  diffRulePacks,
  previewRulePackImport,
  validateImportedRulePack,
  validateRulePackSchema
} from "../src/rulePacks.js";
import { makeSampleProject, rulesData } from "./fixtures.js";

async function makePack(overrides = {}) {
  const pack = structuredClone(rulesData);
  Object.assign(pack, {
    pack_version: "1.0.1",
    pack_date: "2026-10-12",
    checksum: "",
    ...overrides
  });
  pack.checksum = await calculatePackChecksum(pack);
  return pack;
}

test("pack schema rejects malformed rule values and duplicate identifiers", async () => {
  const malformed = await makePack();
  malformed.rules[0].calculation.rate_basis_points.value = "1200";
  assert.throws(() => validateRulePackSchema(malformed), TypeError);

  const duplicate = await makePack();
  duplicate.rules[1].id = duplicate.rules[0].id;
  assert.throws(() => validateRulePackSchema(duplicate), /must be unique/);
});

test("pack import rejects a bad checksum and an older pack", async () => {
  const badChecksum = await makePack();
  badChecksum.checksum = "0".repeat(64);
  await assert.rejects(
    validateImportedRulePack(badChecksum, rulesData),
    /checksum does not match/
  );

  const oldPack = await makePack({ pack_date: "2026-10-10" });
  await assert.rejects(
    validateImportedRulePack(oldPack, rulesData),
    /must be newer/
  );
});

test("pack import accepts a valid newer pack", async () => {
  const pack = await makePack();
  assert.equal(await validateImportedRulePack(pack, rulesData), pack);
});

test("pack diff reports metadata changes and project impact", async () => {
  const pack = await makePack();
  pack.rules[0].note.en = `${pack.rules[0].note.en} Sample metadata update.`;
  pack.checksum = await calculatePackChecksum(pack);
  const changes = diffRulePacks(rulesData, pack);
  assert.ok(
    changes.some(
      (change) =>
        change.ruleId === rulesData.rules[0].id && change.field === "note.en"
    )
  );

  const preview = previewRulePackImport(rulesData, pack, makeSampleProject(), {
    asOfDate: "2026-10-11"
  });
  const expected = calculateProject(makeSampleProject(), rulesData, {
    asOfDate: "2026-10-11"
  });
  assert.equal(
    preview.impact.oldEmployerCosts,
    expected.costs.estimatedEmployerCosts
  );
  assert.equal(
    preview.impact.newEmployerCosts,
    expected.costs.estimatedEmployerCosts
  );
  assert.equal(preview.impact.employerCostDifference, 0);
});

test("rural offline demo compares the newer illustrative pack honestly", async () => {
  const [project, oldPack, newPack] = await Promise.all([
    readJson("../data/sample-rural-offline.json"),
    readJson("../data/rules-pack-old.json"),
    readJson("../data/rules-pack-new.json")
  ]);
  const validatedProject = validateProject(project);
  assert.equal(validatedProject.valid, true);
  assert.equal(
    validatedProject.value.roles.reduce((sum, role) => sum + role.headcount, 0),
    8
  );
  assert.equal(validatedProject.value.roles.length, 4);
  assert.ok(
    validatedProject.value.roles.some(
      (role) => role.contractType === "volunteer_stipend"
    )
  );

  assert.equal(await calculatePackChecksum(oldPack), oldPack.checksum);
  assert.equal(await calculatePackChecksum(newPack), newPack.checksum);
  await validateImportedRulePack(newPack, oldPack);
  assert.equal(oldPack.pack_date, "2025-08-13");
  assert.equal(newPack.pack_date, "2026-10-12");
  assert.deepEqual(
    withoutVerificationDates(oldPack.rules),
    withoutVerificationDates(newPack.rules)
  );

  const oldEstimate = calculateProject(validatedProject.value, oldPack, {
    asOfDate: "2026-10-13",
    forceCautious: true
  }).uncertainty;
  assert.ok(
    oldEstimate.rules.some(
      (rule) => rule.freshness === "stale" || rule.freshness === "expired"
    )
  );
  assert.equal(
    oldEstimate.rules.find((rule) => rule.ruleId === "minimum_wage_check")
      .freshness,
    "unverified"
  );
  const newCalculation = calculateProject(validatedProject.value, newPack, {
    asOfDate: "2026-10-13",
    forceCautious: true
  });
  const newExpected = newCalculation.uncertainty.costs.expected;
  assert.ok(newExpected >= oldEstimate.costs.quantified.low);
  assert.ok(newExpected <= oldEstimate.costs.quantified.high);
  assert.equal(
    newExpected - oldEstimate.costs.expected,
    0,
    "The illustrative packs deliberately have unchanged numeric inputs."
  );
  assert.equal(oldEstimate.costs.high, null);
  assert.ok(oldEstimate.unquantifiableRuleIds.includes("minimum_wage_check"));
});

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

function withoutVerificationDates(value) {
  if (Array.isArray(value)) {
    return value.map(withoutVerificationDates);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "last_verified")
      .map(([key, child]) => [key, withoutVerificationDates(child)])
  );
}
