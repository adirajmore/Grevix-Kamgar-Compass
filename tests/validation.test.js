import assert from "node:assert/strict";
import test from "node:test";
import { isValidDate, validateProject } from "../src/validation.js";
import { sampleProject } from "./fixtures.js";

test("validates and normalizes a complete project", () => {
  const result = validateProject({ ...sampleProject, name: "  Demo  " });
  assert.equal(result.valid, true);
  assert.equal(result.value.name, "Demo");
  assert.equal(result.value.roles.length, 5);
});

test("accepts an empty roles array and roles starting after the grant", () => {
  const empty = validateProject({ ...sampleProject, roles: [] });
  const afterGrant = validateProject({
    ...sampleProject,
    roles: [
      {
        ...sampleProject.roles[0],
        startMonth: 19,
        endMonth: 19
      }
    ]
  });
  assert.equal(empty.valid, true);
  assert.equal(afterGrant.valid, true);
});

test("reports each invalid project field", () => {
  const result = validateProject({
    ...sampleProject,
    name: "",
    state: "XX",
    grantStartDate: "2026-02-30",
    grantDurationMonths: 61,
    grantAmount: -1,
    complianceAllowance: -1,
    roles: "not an array"
  });
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "complianceAllowance",
    "grantAmount",
    "grantDurationMonths",
    "grantStartDate",
    "name",
    "roles",
    "state"
  ]);
});

test("reports invalid values for every role field", () => {
  const role = {
    ...sampleProject.roles[0],
    title: "",
    headcount: 0,
    monthlySalary: -1,
    contractType: "unknown",
    genderMix: "unknown",
    weeklyHours: 169,
    regularPayment: "yes",
    controlledByOrganization: null,
    startMonth: 20,
    endMonth: 2
  };
  const result = validateProject({ ...sampleProject, roles: [role] });
  assert.deepEqual(Object.keys(result.errors).sort(), [
    "roles.0.contractType",
    "roles.0.controlledByOrganization",
    "roles.0.endMonth",
    "roles.0.genderMix",
    "roles.0.headcount",
    "roles.0.monthlySalary",
    "roles.0.regularPayment",
    "roles.0.startMonth",
    "roles.0.title",
    "roles.0.weeklyHours"
  ]);
});

test("rejects a project with more than 100 role rows", () => {
  const roles = Array.from({ length: 101 }, (_, index) => ({
    ...sampleProject.roles[0],
    id: `role-${index + 1}`
  }));
  const result = validateProject({ ...sampleProject, roles });
  assert.equal(result.errors.roles, "validation.roleLimit");
});

test("checks calendar dates including leap years", () => {
  assert.equal(isValidDate("2024-02-29"), true);
  assert.equal(isValidDate("2025-02-29"), false);
  assert.equal(isValidDate("0001-01-01"), true);
});
