import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateComplianceGap,
  calculateGrantCliff,
  calculateProject,
  calculateStaffCosts,
  evaluateRules
} from "../src/engine.js";
import { makeProject, makeSampleProject, rulesData } from "./fixtures.js";

function withStateRate(minimumWage) {
  return {
    ...rulesData,
    state_minimum_wages: {
      MH: {
        last_verified: "TO VERIFY",
        rates: [
          {
            skill_category: "unskilled",
            monthly_minimum_wage: minimumWage,
            last_verified: "TO VERIFY"
          }
        ]
      }
    }
  };
}

test("EPF headcount threshold excludes 19 and flags 20 employees", () => {
  const below = calculateProject(makeProject({}, { headcount: 19 }), rulesData);
  const at = calculateProject(makeProject({}, { headcount: 20 }), rulesData);
  assert.equal(
    below.evaluations[0].items.find((rule) => rule.area === "epf").status,
    "not_applicable"
  );
  assert.equal(
    at.evaluations[0].items.find((rule) => rule.area === "epf").status,
    "needs_verification"
  );
});

test("EPF excludes non-employees and caps the illustrative contribution base", () => {
  const nonEmployee = calculateProject(
    makeProject(
      {},
      {
        headcount: 20,
        contractType: "consultant"
      }
    ),
    rulesData
  );
  const capped = calculateProject(
    makeProject(
      {},
      {
        headcount: 20,
        monthlySalary: 30000
      }
    ),
    rulesData
  );
  assert.equal(
    nonEmployee.evaluations[0].items.find((rule) => rule.area === "epf").status,
    "not_applicable"
  );
  assert.equal(
    capped.evaluations[0].items.find((rule) => rule.area === "epf")
      .employerCost,
    36000
  );
});

test("ESI excludes 9 employees and wages above its scenario ceiling", () => {
  const below = calculateProject(
    makeProject({}, { headcount: 9, monthlySalary: 20000 }),
    rulesData
  );
  const above = calculateProject(
    makeProject({}, { headcount: 10, monthlySalary: 21001 }),
    rulesData
  );
  const at = calculateProject(
    makeProject({}, { headcount: 10, monthlySalary: 21000 }),
    rulesData
  );
  assert.equal(
    below.evaluations[0].items.find((rule) => rule.area === "esi").status,
    "not_applicable"
  );
  assert.equal(
    above.evaluations[0].items.find((rule) => rule.area === "esi").status,
    "not_applicable"
  );
  assert.equal(
    at.evaluations[0].items.find((rule) => rule.area === "esi").status,
    "needs_verification"
  );
});

test("gratuity shows accrual and marks fixed-term eligibility at its scenario boundary", () => {
  const early = calculateProject(
    makeProject({ grantDurationMonths: 11 }, { endMonth: 11 }),
    rulesData
  );
  const atBoundary = calculateProject(
    makeProject({ grantDurationMonths: 12 }, { endMonth: 12 }),
    rulesData
  );
  assert.equal(
    early.evaluations.at(-1).items.find((rule) => rule.area === "gratuity")
      .reason,
    "result.reason.gratuityAccrual"
  );
  assert.equal(
    atBoundary.evaluations.at(-1).items.find((rule) => rule.area === "gratuity")
      .reason,
    "result.reason.gratuityPotentiallyEligible"
  );
});

test("minimum-wage check flags below-rate wages and handles missing state data", () => {
  const role = { ...makeProject().roles[0], skillCategory: "unskilled" };
  const below = calculateProject(
    makeProject({}, { ...role, monthlySalary: 19999 }),
    withStateRate(20000)
  );
  const at = calculateProject(
    makeProject({}, { ...role, monthlySalary: 20000 }),
    withStateRate(20000)
  );
  const missing = calculateProject(makeProject(), rulesData);
  assert.equal(
    below.evaluations[0].items.find((rule) => rule.area === "minimum_wage")
      .status,
    "needs_verification"
  );
  assert.equal(
    at.evaluations[0].items.find((rule) => rule.area === "minimum_wage").status,
    "not_applicable"
  );
  assert.equal(
    missing.evaluations[0].items.find((rule) => rule.area === "minimum_wage")
      .status,
    "pending"
  );
});

test("POSH screening changes at 10 and remains a screening result", () => {
  const below = calculateProject(makeProject({}, { headcount: 9 }), rulesData);
  const at = calculateProject(makeProject({}, { headcount: 10 }), rulesData);
  const costed = calculateProject(
    makeProject({ poshMonthlyCostPerWorker: 250 }, { headcount: 10 }),
    rulesData
  );
  assert.equal(
    below.evaluations[0].items.find((rule) => rule.area === "posh").status,
    "not_applicable"
  );
  assert.equal(
    at.evaluations[0].items.find((rule) => rule.area === "posh").status,
    "needs_verification"
  );
  assert.equal(
    at.evaluations[0].items.find((rule) => rule.area === "posh").employerCost,
    0
  );
  assert.equal(
    costed.evaluations[0].items.find((rule) => rule.area === "posh")
      .employerCost,
    2500
  );
});

test("classification shows indicator counts on either side of hours and duration signals", () => {
  const below = calculateProject(
    makeProject(
      { grantDurationMonths: 5 },
      {
        headcount: 1,
        weeklyHours: 19,
        endMonth: 5
      }
    ),
    rulesData
  );
  const at = calculateProject(
    makeProject(
      { grantDurationMonths: 6 },
      {
        headcount: 1,
        weeklyHours: 20,
        endMonth: 6
      }
    ),
    rulesData
  );
  const belowSignals = below.evaluations
    .at(-1)
    .items.find((rule) => rule.area === "classification");
  const atSignals = at.evaluations
    .at(-1)
    .items.find((rule) => rule.area === "classification");
  assert.equal(belowSignals.signalCount, 2);
  assert.equal(atSignals.signalCount, 4);
  assert.equal(atSignals.status, "needs_verification");
});

test("summarizes provisional gap and handles zero-cost projects without division by zero", () => {
  const project = makeProject();
  const calculation = calculateProject(project, rulesData);
  assert.ok(calculation.gap.scoreBasisPoints > 0);
  assert.ok(calculation.gap.requiredEmployerCostEstimate > 0);
  const zero = makeProject(
    { complianceAllowance: 0 },
    {
      monthlySalary: 0,
      headcount: 1,
      startMonth: 19,
      endMonth: 19
    }
  );
  assert.equal(calculateProject(zero, rulesData).gap.scoreBasisPoints, null);
});

test("calculates the grant cliff through three post-grant months", () => {
  const project = makeSampleProject();
  const result = calculateProject(project, rulesData);
  assert.equal(result.cliff.timeline.length, project.grantDurationMonths + 3);
  assert.equal(result.cliff.timeline.at(-1).grantEnded, true);
  assert.equal(result.cliff.timeline.at(-1).activeHeadcount, 0);
  assert.ok(result.cliff.lostCoverageHeadcount > 0);
  assert.ok(result.cliff.unfundedLiabilityEstimate > 0);
  assert.ok(
    result.cliff.timeline[1].accruedGratuityEstimate >
      result.cliff.timeline[0].accruedGratuityEstimate
  );
});

test("roles beginning after the grant have no grant-period costs", () => {
  const project = makeProject(
    { grantDurationMonths: 12 },
    {
      startMonth: 13,
      endMonth: 13
    }
  );
  const result = calculateProject(project, rulesData);
  assert.equal(result.costs.salary, 0);
  assert.equal(result.evaluations.length, 0);
  assert.equal(result.gap.scoreBasisPoints, null);
});

test("retains accrued gratuity for roles ending before the grant end", () => {
  const project = makeProject(
    { grantDurationMonths: 12 },
    { startMonth: 1, endMonth: 6 }
  );
  const result = calculateProject(project, rulesData);
  assert.ok(result.cliff.unfundedLiabilityEstimate > 0);
  assert.equal(
    result.cliff.timeline[11].accruedGratuityEstimate,
    result.cliff.unfundedLiabilityEstimate
  );
});

test("recalculates role-month contributions when headcount crosses a threshold", () => {
  const project = makeProject({
    grantDurationMonths: 2,
    roles: [
      {
        ...makeProject().roles[0],
        headcount: 9,
        monthlySalary: 20000,
        startMonth: 1,
        endMonth: 2
      },
      {
        ...makeProject().roles[0],
        id: "tenth-worker",
        title: "Tenth worker",
        headcount: 1,
        monthlySalary: 20000,
        startMonth: 2,
        endMonth: 2
      }
    ]
  });
  const result = calculateProject(project, rulesData);
  const firstRole = result.costs.roles.find(
    (role) => role.roleId === project.roles[0].id
  );
  assert.equal(
    firstRole.monthlyCosts[1].employerCosts -
      firstRole.monthlyCosts[0].employerCosts,
    5850
  );
});

test("sample NGO includes twelve people, six rule areas, and a classification signal", async () => {
  const { makeSampleProject } = await import("./fixtures.js");
  const project = makeSampleProject();
  const result = calculateProject(project, rulesData);
  assert.equal(
    project.roles.reduce((total, role) => total + role.headcount, 0),
    12
  );
  assert.equal(project.grantDurationMonths, 18);
  assert.equal(new Set(rulesData.rules.map((rule) => rule.area)).size, 6);
  assert.ok(
    result.evaluations
      .flatMap((month) => month.items)
      .some((rule) => rule.area === "classification" && rule.signalCount > 0)
  );
});

test("provides pure intermediate functions for costs, gaps, and cliffs", () => {
  const project = makeSampleProject();
  const evaluations = evaluateRules(project, rulesData);
  const costs = calculateStaffCosts(project, evaluations);
  const gap = calculateComplianceGap(project, costs);
  const cliff = calculateGrantCliff(project, evaluations, costs);
  assert.equal(costs.salary, 4572000);
  assert.equal(gap.requiredEmployerCostEstimate, costs.estimatedEmployerCosts);
  assert.equal(cliff.grantEndMonth, project.grantDurationMonths);
});
