import { readFile } from "node:fs/promises";
import { validateProject } from "../src/validation.js";

export const rulesData = JSON.parse(
  await readFile(new URL("../data/rules.json", import.meta.url), "utf8")
);
export const sampleProject = JSON.parse(
  await readFile(new URL("../data/sample.json", import.meta.url), "utf8")
);

/**
 * Create a validated single-role fixture for threshold tests.
 * @param {object} overrides Project-level overrides.
 * @param {object} roleOverrides Role-level overrides.
 * @returns {object} Normalized test project.
 */
export function makeProject(overrides = {}, roleOverrides = {}) {
  const input = {
    ...sampleProject,
    roles: [
      {
        ...sampleProject.roles[0],
        ...roleOverrides
      }
    ],
    ...overrides
  };
  const validated = validateProject(input);
  if (!validated.valid) {
    throw new Error(
      `Invalid test fixture: ${JSON.stringify(validated.errors)}`
    );
  }
  return validated.value;
}

/**
 * Return the complete validated demo project.
 * @returns {object} Normalized sample project.
 */
export function makeSampleProject() {
  const validated = validateProject(sampleProject);
  if (!validated.valid) {
    throw new Error(
      `Invalid sample project: ${JSON.stringify(validated.errors)}`
    );
  }
  return validated.value;
}

/**
 * Locate a named rule decision within a project calculation.
 * @param {object} result Engine calculation result.
 * @param {string} ruleId Rule identifier.
 * @param {number} month Grant month.
 * @returns {object|undefined} Matching decision if present.
 */
export function findDecision(result, ruleId, month = 1) {
  return result.evaluations
    .find((item) => item.month === month)
    ?.items.find((item) => item.ruleId === ruleId);
}
