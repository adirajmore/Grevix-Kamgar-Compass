import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("Hindi and Marathi locales include every English translation key", async () => {
  const [english, hindi, marathi] = await Promise.all([
    readJson("../locales/en.json"),
    readJson("../locales/hi.json"),
    readJson("../locales/mr.json")
  ]);
  const englishKeys = Object.keys(english).sort();
  assert.deepEqual(Object.keys(hindi).sort(), englishKeys);
  assert.deepEqual(Object.keys(marathi).sort(), englishKeys);
});

test("all Hindi and Marathi translations remain marked unreviewed", async () => {
  const [hindi, marathi, rules] = await Promise.all([
    readJson("../locales/hi.json"),
    readJson("../locales/mr.json"),
    readJson("../data/rules.json")
  ]);
  for (const locale of [hindi, marathi]) {
    for (const translation of Object.values(locale)) {
      assert.equal(translation.reviewed, false);
    }
  }
  for (const rule of rules.rules) {
    assert.equal(typeof rule.source_law, "string");
    for (const field of ["name", "note", "worker_explanation"]) {
      assert.equal(typeof rule[field].en, "string");
      for (const language of ["hi", "mr"]) {
        assert.equal(rule[field][language].reviewed, false);
      }
    }
    assert.equal(rule.last_verified, "TO VERIFY");
    assert.ok(rule.source_law.length > 0);
    assert.ok(rule.source_section.length > 0);
  }
});

test("the rules data contains all six reviewable areas and marked scenario values", async () => {
  const rules = await readJson("../data/rules.json");
  assert.deepEqual(
    rules.rules.map((rule) => rule.area).sort(),
    ["classification", "epf", "esi", "gratuity", "minimum_wage", "posh"].sort()
  );
  function verifyNumericInputs(value) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        verifyNumericInputs(entry);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    if (typeof value.value === "number") {
      assert.equal(value.last_verified, "TO VERIFY");
    }
    for (const child of Object.values(value)) {
      verifyNumericInputs(child);
    }
  }
  verifyNumericInputs(rules);
});
