import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateComplianceGap,
  calculateGrantCliff,
  calculateProject,
  calculateReservePlan,
  calculateStaffCosts,
  buildWorkerRightsCard,
  compareScenarios,
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

function withRuleDates(dateOverrides = {}, driftOverrides = {}) {
  return {
    ...rulesData,
    rules: rulesData.rules.map((rule) => ({
      ...setVerificationDate(rule, dateOverrides[rule.id] || "2026-10-10"),
      ...(driftOverrides[rule.id]
        ? { drift_assumption: driftOverrides[rule.id] }
        : {})
    }))
  };
}

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

function withFreshMinimumWages(data) {
  return {
    ...data,
    state_minimum_wages: {
      MH: {
        last_verified: "2026-10-10",
        rates: [
          {
            skill_category: "unskilled",
            monthly_minimum_wage: 1,
            last_verified: "2026-10-10"
          }
        ]
      }
    }
  };
}

function addTestSkillCategories(project) {
  return {
    ...project,
    roles: project.roles.map((role) => ({
      ...role,
      skillCategory: "unskilled"
    }))
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

test("reserve planner returns zero set-aside and immediate sufficiency for zero liability", () => {
  const plan = calculateReservePlan({ unfundedLiabilityEstimate: 0 }, null, {
    monthsRemaining: 6,
    asOfDate: "2026-10-31"
  });
  assert.deepEqual(plan.monthlySetAside, { low: 0, expected: 0, high: 0 });
  assert.deepEqual(plan.sufficientBy, {
    low: "2026-10-31",
    expected: "2026-10-31",
    high: "2026-10-31"
  });
  assert.equal(plan.progress.length, 7);
  assert.equal(plan.progress[0].percentage.expected, 100);
});

test("reserve planner marks an already sufficient reserve as sufficient today", () => {
  const plan = calculateReservePlan(
    { unfundedLiabilityEstimate: 25000 },
    { low: 20000, expected: 25000, high: 30000 },
    {
      monthsRemaining: 12,
      startingReserve: 25000,
      asOfDate: "2026-10-11"
    }
  );
  assert.deepEqual(plan.monthlySetAside, { low: 0, expected: 0, high: 417 });
  assert.equal(plan.sufficientBy.low, "2026-10-11");
  assert.equal(plan.sufficientBy.expected, "2026-10-11");
  assert.equal(plan.sufficientBy.high, "2027-10-11");
});

test("reserve planner handles one remaining month and caps month-end dates", () => {
  const plan = calculateReservePlan(
    { unfundedLiabilityEstimate: 10001 },
    null,
    { monthsRemaining: 1, startingReserve: 1, asOfDate: "2026-01-31" }
  );
  assert.deepEqual(plan.monthlySetAside, {
    low: 10000,
    expected: 10000,
    high: 10000
  });
  assert.deepEqual(plan.sufficientBy, {
    low: "2026-02-28",
    expected: "2026-02-28",
    high: "2026-02-28"
  });
  assert.equal(plan.progress.at(-1).balance.expected, 10001);
});

test("reserve planner leaves an unquantifiable cautious high amount open", () => {
  const plan = calculateReservePlan(
    { unfundedLiabilityEstimate: 1000 },
    { low: 1000, expected: 1200, high: null },
    {
      monthsRemaining: 4,
      startingReserve: 200,
      asOfDate: "2026-10-11"
    }
  );
  assert.deepEqual(plan.monthlySetAside, {
    low: 200,
    expected: 250,
    high: null
  });
  assert.equal(plan.sufficientBy.high, null);
  assert.equal(plan.progress.at(-1).balance.high, null);
});

test("Worker Rights Card groups modeled protections without deciding legal eligibility", () => {
  const project = makeProject(
    { grantDurationMonths: 12 },
    {
      endMonth: 7,
      headcount: 1,
      monthlySalary: 20000,
      contractType: "employee_fixed"
    }
  );
  const calculation = calculateProject(project, rulesData);
  const card = buildWorkerRightsCard(
    project,
    project.roles[0].id,
    calculation,
    rulesData
  );
  assert.equal(card.lastWorkingMonth, 7);
  assert.equal(card.grantDurationMonths, 12);
  assert.ok(
    card.possibleProtections.some((item) => item.ruleId === "gratuity_accrual")
  );
  assert.ok(
    card.notConfirmedProtections.some(
      (item) =>
        item.ruleId === "minimum_wage_check" && item.status === "pending"
    )
  );
  assert.ok(
    card.possibleProtections.every(
      (item) => item.status === "needs_verification" && item.lastVerified
    )
  );
  assert.equal(
    buildWorkerRightsCard(project, "missing", calculation, rulesData),
    null
  );
  assert.equal(
    buildWorkerRightsCard(project, project.roles[0].id, null, rulesData),
    null
  );
});

test("compares saved scenarios against the first scenario using calculated metrics", () => {
  const baseline = makeProject(
    { grantDurationMonths: 12 },
    {
      id: "worker",
      title: "Worker",
      headcount: 1,
      monthlySalary: 20000,
      weeklyHours: 40,
      regularPayment: true,
      controlledByOrganization: true,
      startMonth: 1,
      endMonth: 12
    }
  );
  const restructured = {
    ...baseline,
    roles: [
      {
        ...baseline.roles[0],
        weeklyHours: 10,
        regularPayment: false,
        controlledByOrganization: false,
        endMonth: 5
      }
    ]
  };
  const result = compareScenarios(
    [
      { id: "baseline", name: "Current setup", project: baseline },
      {
        id: "restructured",
        name: "Shorter arrangement",
        project: restructured
      }
    ],
    withRuleDates(),
    { asOfDate: "2026-10-11" }
  );

  assert.equal(result.baselineId, "baseline");
  assert.equal(result.scenarios[0].delta.trueCost, 0);
  assert.equal(result.scenarios[0].delta.classificationWarnings, 0);
  assert.equal(result.scenarios[0].metrics.classificationWarnings, 1);
  assert.equal(result.scenarios[1].metrics.classificationWarnings, 0);
  assert.ok(result.scenarios[1].delta.trueCost < 0);
  assert.ok(result.scenarios[1].delta.unfundedLiability <= 0);
  assert.equal(result.summary.type, "classification_reduction");
  assert.equal(result.summary.scenarioId, "restructured");
  assert.equal(result.summary.classificationWarningsRemoved, 1);
  assert.equal(
    result.summary.averageMonthlyCostDifference,
    result.scenarios[1].delta.averageMonthlyCost
  );
});

test("fresh-rule sample NGO keeps the standard calculation snapshot unchanged", () => {
  const project = addTestSkillCategories(makeSampleProject());
  const result = calculateProject(
    project,
    withFreshMinimumWages(withRuleDates()),
    { asOfDate: "2026-10-11" }
  );
  assert.deepEqual(
    {
      salary: result.costs.salary,
      employerCosts: result.costs.estimatedEmployerCosts,
      total: result.costs.estimatedTotal,
      gap: result.gap,
      cliff: {
        liability: result.cliff.unfundedLiabilityEstimate,
        lostCoverageHeadcount: result.cliff.lostCoverageHeadcount,
        endCost: result.cliff.estimatedEmployerCostAtGrantEnd
      },
      hasUncertainty: Object.hasOwn(result, "uncertainty")
    },
    {
      salary: 4572000,
      employerCosts: 258714,
      total: 4830714,
      gap: {
        gap: 258714,
        scoreBasisPoints: 536,
        denominator: 4830714,
        budgetedStaffCost: 4572000,
        requiredEmployerCostEstimate: 258714
      },
      cliff: {
        liability: 206064,
        lostCoverageHeadcount: 5,
        endCost: 258714
      },
      hasUncertainty: false
    }
  );
});

test("cautious cost, gap and grant-cliff ranges are ordered for mixed freshness", () => {
  const project = makeProject(
    { grantDurationMonths: 12 },
    { headcount: 10, monthlySalary: 18000, endMonth: 12 }
  );
  const result = calculateProject(
    project,
    withRuleDates({ esi_employer: "2025-10-11" }),
    { asOfDate: "2026-10-11" }
  );
  assert.equal(result.uncertainty.mode, "cautious");
  assert.equal(
    result.uncertainty.rules.find((rule) => rule.ruleId === "esi_employer")
      .freshness,
    "stale"
  );
  for (const range of [
    result.uncertainty.costs.quantified,
    result.uncertainty.gap.quantified,
    result.uncertainty.cliff.quantified
  ]) {
    assert.ok(range.low <= range.expected);
    assert.ok(range.expected <= range.high);
  }
  assert.equal(
    result.uncertainty.rules.find((rule) => rule.ruleId === "gratuity_accrual")
      .freshness,
    "fresh"
  );
  assert.equal(result.uncertainty.costs.high, null);
  assert.ok(
    result.uncertainty.unquantifiableRuleIds.includes("minimum_wage_check")
  );
});

test("zero drift produces a single-value range", () => {
  const project = makeProject(
    { grantDurationMonths: 2 },
    { headcount: 10, monthlySalary: 18000, endMonth: 2 }
  );
  const result = calculateProject(
    project,
    withRuleDates(
      { esi_employer: "2025-10-11" },
      {
        esi_employer: {
          annual_change_low_pct: 0,
          annual_change_high_pct: 0,
          basis: "ASSUMPTION - TO VERIFY"
        }
      }
    ),
    { asOfDate: "2026-10-11" }
  );
  assert.equal(
    result.uncertainty.costs.quantified.low,
    result.costs.estimatedEmployerCosts
  );
  assert.equal(
    result.uncertainty.costs.quantified.low,
    result.uncertainty.costs.quantified.expected
  );
  assert.equal(
    result.uncertainty.costs.quantified.expected,
    result.uncertainty.costs.quantified.high
  );
});

test("unverified cost rules remain unquantifiable and have no recommendation", () => {
  const project = makeProject(
    { grantDurationMonths: 2 },
    { headcount: 10, monthlySalary: 18000, endMonth: 2 }
  );
  const result = calculateProject(project, rulesData, {
    asOfDate: "2026-10-11"
  });
  assert.ok(result.uncertainty.unquantifiableRuleIds.includes("esi_employer"));
  assert.equal(result.uncertainty.costs.high, null);
  assert.equal(result.uncertainty.costs.recommended, null);
  assert.equal(result.uncertainty.gap.high, null);
  assert.equal(result.uncertainty.cliff.high, null);
});
