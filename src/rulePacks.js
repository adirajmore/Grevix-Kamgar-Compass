import { RULE_PACK_SCHEMA_VERSION } from "./constants.js";
import { calculateProject } from "./engine.js";
import { getAsOfDate } from "./freshness.js";

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MAX_RULES = 100;
const MAX_PACK_TEXT_LENGTH = 2000;
const RULE_AREAS = new Set([
  "epf",
  "esi",
  "gratuity",
  "minimum_wage",
  "posh",
  "classification"
]);

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])])
    );
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(message);
  }
}

function validateText(value, label, maxLength = MAX_PACK_TEXT_LENGTH) {
  assert(
    typeof value === "string" &&
      value.trim().length > 0 &&
      value.length <= maxLength,
    `${label} must be a non-empty string of at most ${maxLength} characters.`
  );
}

function validateNumber(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  assert(
    Number.isSafeInteger(value) && value >= 0 && value <= maximum,
    `${label} must be a non-negative safe integer no greater than ${maximum}.`
  );
}

function validateLocalizedField(value, label) {
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must contain en, hi and mr translations.`
  );
  validateText(value.en, `${label}.en`);
  for (const language of ["hi", "mr"]) {
    const entry = value[language];
    const text = typeof entry === "string" ? entry : entry?.text;
    validateText(text, `${label}.${language}`);
    if (typeof entry === "object") {
      assert(
        typeof entry.reviewed === "boolean",
        `${label}.${language}.reviewed must be a boolean.`
      );
    }
  }
}

function validateRule(rule, identifiers, index) {
  const label = `rules[${index}]`;
  assert(
    rule && typeof rule === "object" && !Array.isArray(rule),
    `${label} must be an object.`
  );
  validateText(rule.id, `${label}.id`, 100);
  assert(!identifiers.has(rule.id), `${label}.id must be unique.`);
  identifiers.add(rule.id);
  validateText(rule.area, `${label}.area`, 100);
  assert(RULE_AREAS.has(rule.area), `${label}.area is not supported.`);
  validateLocalizedField(rule.name, `${label}.name`);
  validateLocalizedField(rule.note, `${label}.note`);
  validateLocalizedField(
    rule.worker_explanation,
    `${label}.worker_explanation`
  );
  validateText(rule.source_law, `${label}.source_law`);
  validateText(rule.source_section, `${label}.source_section`);
  validateText(rule.last_verified, `${label}.last_verified`, 20);
  assert(
    rule.last_verified === "TO VERIFY" ||
      (typeof rule.last_verified === "string" &&
        getAsOfDate(rule.last_verified) === rule.last_verified),
    `${label}.last_verified must be an ISO date or TO VERIFY.`
  );
  assert(
    rule.applies_if &&
      typeof rule.applies_if === "object" &&
      !Array.isArray(rule.applies_if),
    `${label}.applies_if must be an object.`
  );
  if (rule.applies_if.contract_types !== undefined) {
    assert(
      Array.isArray(rule.applies_if.contract_types) &&
        rule.applies_if.contract_types.every(
          (type) => typeof type === "string"
        ),
      `${label}.applies_if.contract_types must be a string array.`
    );
  }
  if (["epf", "esi", "gratuity", "minimum_wage"].includes(rule.area)) {
    assert(
      Array.isArray(rule.applies_if.contract_types),
      `${label}.applies_if.contract_types is required for this rule area.`
    );
  }
  assert(
    rule.calculation &&
      typeof rule.calculation === "object" &&
      !Array.isArray(rule.calculation),
    `${label}.calculation must be an object.`
  );
  validateText(rule.calculation.type, `${label}.calculation.type`, 100);
  if (rule.area === "classification") {
    const signals = rule.calculation.signals;
    assert(
      signals?.hours_at_least_weekly && signals?.duration_at_least_months,
      `${label}.calculation.signals is incomplete.`
    );
  }
  for (const optionalText of [
    "effective_from",
    "volatility",
    "confidence",
    "refer_to_professional_if"
  ]) {
    if (rule[optionalText] !== undefined) {
      validateText(rule[optionalText], `${label}.${optionalText}`);
    }
  }
  if (
    rule.effective_from !== undefined &&
    rule.effective_from !== "TO VERIFY"
  ) {
    assert(
      getAsOfDate(rule.effective_from) === rule.effective_from,
      `${label}.effective_from must be an ISO date or TO VERIFY.`
    );
  }
  if (rule.volatility !== undefined) {
    assert(
      ["low", "medium", "high"].includes(rule.volatility),
      `${label}.volatility must be low, medium or high.`
    );
  }
  if (rule.drift_assumption !== undefined) {
    const assumption = rule.drift_assumption;
    assert(
      assumption && typeof assumption === "object",
      `${label}.drift_assumption must be an object.`
    );
    for (const key of ["annual_change_low_pct", "annual_change_high_pct"]) {
      assert(
        typeof assumption[key] === "number" &&
          Number.isFinite(assumption[key]) &&
          assumption[key] >= 0 &&
          assumption[key] <= 1000,
        `${label}.drift_assumption.${key} must be between 0 and 1000.`
      );
    }
    assert(
      assumption.annual_change_high_pct >= assumption.annual_change_low_pct,
      `${label}.drift_assumption high value must not be below the low value.`
    );
    validateText(assumption.basis, `${label}.drift_assumption.basis`, 200);
  }
  validateRuleNumbers(rule, label);
}

function validateRuleNumbers(value, path) {
  if (path.endsWith(".drift_assumption")) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateRuleNumbers(item, `${path}[${index}]`)
    );
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key === "value") {
      validateNumber(child, childPath, 1000000000);
    } else if (typeof child === "number") {
      validateNumber(child, childPath, 1000000000);
    } else {
      validateRuleNumbers(child, childPath);
    }
  }
}

function validateMinimumWages(value) {
  if (value === undefined) {
    return;
  }
  assert(
    value && typeof value === "object" && !Array.isArray(value),
    "state_minimum_wages must be an object."
  );
  for (const [state, data] of Object.entries(value)) {
    assert(/^[A-Z]{2}$/.test(state), `Invalid state code: ${state}.`);
    assert(
      data && typeof data === "object" && Array.isArray(data.rates),
      `state_minimum_wages.${state}.rates must be an array.`
    );
    assert(data.rates.length <= 1000, `Too many wage rates for ${state}.`);
    for (const [index, rate] of data.rates.entries()) {
      validateText(
        rate.skill_category,
        `${state}.rates[${index}].skill_category`,
        100
      );
      validateNumber(
        rate.monthly_minimum_wage,
        `${state}.rates[${index}].monthly_minimum_wage`,
        1000000000
      );
    }
  }
}

/**
 * Validate the structural safety of a shareable rules pack.
 * @param {object} pack Untrusted parsed JSON value.
 * @returns {object} The validated input pack.
 */
export function validateRulePackSchema(pack) {
  assert(
    pack && typeof pack === "object" && !Array.isArray(pack),
    "Rules pack must be a JSON object."
  );
  assert(
    pack.schema_version === RULE_PACK_SCHEMA_VERSION,
    "Unsupported rules pack schema version."
  );
  validateText(pack.pack_version, "pack_version", 100);
  assert(
    typeof pack.pack_date === "string" &&
      getAsOfDate(pack.pack_date) === pack.pack_date,
    "pack_date must be a valid ISO date."
  );
  validateText(pack.jurisdiction_scope, "jurisdiction_scope", 300);
  assert(
    SHA256_HEX.test(pack.checksum || ""),
    "checksum must be a SHA-256 hexadecimal digest."
  );
  assert(Array.isArray(pack.rules), "rules must be an array.");
  assert(
    pack.rules.length > 0 && pack.rules.length <= MAX_RULES,
    `rules must contain 1 to ${MAX_RULES} entries.`
  );
  const identifiers = new Set();
  pack.rules.forEach((rule, index) => validateRule(rule, identifiers, index));
  validateMinimumWages(pack.state_minimum_wages);
  return pack;
}

/**
 * Calculate the SHA-256 checksum for a pack, excluding its checksum field.
 * @param {object} pack Rules pack.
 * @returns {Promise<string>} Lowercase hexadecimal SHA-256 digest.
 */
export async function calculatePackChecksum(pack) {
  const payload = { ...pack };
  delete payload.checksum;
  const bytes = new TextEncoder().encode(JSON.stringify(stableValue(payload)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a new pack and require a valid checksum and newer pack date.
 * @param {object} pack Untrusted pack data.
 * @param {object} currentPack Active pack.
 * @returns {Promise<object>} Validated pack.
 */
export async function validateImportedRulePack(pack, currentPack) {
  validateRulePackSchema(pack);
  const checksum = await calculatePackChecksum(pack);
  assert(
    checksum === pack.checksum.toLowerCase(),
    "Rules pack checksum does not match its contents."
  );
  assert(
    typeof currentPack.pack_date === "string" &&
      pack.pack_date > currentPack.pack_date,
    "Rules pack date must be newer than the active pack date."
  );
  return pack;
}

function compareValues(first, second, path, changes, ruleId) {
  if (
    first &&
    second &&
    typeof first === "object" &&
    typeof second === "object" &&
    Array.isArray(first) === Array.isArray(second)
  ) {
    const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
    for (const key of keys) {
      compareValues(
        first[key],
        second[key],
        path ? `${path}.${key}` : key,
        changes,
        ruleId
      );
    }
    return;
  }
  if (JSON.stringify(first) !== JSON.stringify(second)) {
    changes.push({ ruleId, field: path, oldValue: first, newValue: second });
  }
}

/**
 * Describe rule-field changes between two packs.
 * @param {object} oldPack Current pack.
 * @param {object} newPack Candidate pack.
 * @returns {object[]} Field-level differences.
 */
export function diffRulePacks(oldPack, newPack) {
  const previous = new Map(oldPack.rules.map((rule) => [rule.id, rule]));
  const next = new Map(newPack.rules.map((rule) => [rule.id, rule]));
  const changes = [];
  for (const [ruleId, rule] of previous) {
    if (!next.has(ruleId)) {
      changes.push({ ruleId, field: "rule", oldValue: rule, newValue: null });
      continue;
    }
    compareValues(rule, next.get(ruleId), "", changes, ruleId);
  }
  for (const [ruleId, rule] of next) {
    if (!previous.has(ruleId)) {
      changes.push({ ruleId, field: "rule", oldValue: null, newValue: rule });
    }
  }
  return changes;
}

/**
 * Preview a pack diff and its deterministic impact on a project.
 * @param {object} oldPack Current pack.
 * @param {object} newPack Candidate pack.
 * @param {object} project Normalized project input.
 * @param {object} options Calculation settings.
 * @returns {object} Rule diffs and cost/gap impact.
 */
export function previewRulePackImport(oldPack, newPack, project, options) {
  const oldCalculation = calculateProject(project, oldPack, options);
  const newCalculation = calculateProject(project, newPack, options);
  return {
    changes: diffRulePacks(oldPack, newPack),
    impact: {
      oldEmployerCosts: oldCalculation.costs.estimatedEmployerCosts,
      newEmployerCosts: newCalculation.costs.estimatedEmployerCosts,
      employerCostDifference:
        newCalculation.costs.estimatedEmployerCosts -
        oldCalculation.costs.estimatedEmployerCosts,
      oldGapScoreBasisPoints: oldCalculation.gap.scoreBasisPoints,
      newGapScoreBasisPoints: newCalculation.gap.scoreBasisPoints
    }
  };
}
