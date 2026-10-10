import {
  HUNDRED_PERCENT_BASIS_POINTS,
  POST_GRANT_MONTHS
} from "./constants.js";

const EMPLOYEE_CONTRACTS = new Set(["employee_fixed", "employee_permanent"]);
const ESTIMATED_COST_RULES = new Set(["epf", "esi", "gratuity", "posh"]);

function safeMoneyRound(amount, rateBasisPoints) {
  const numerator = BigInt(amount) * BigInt(rateBasisPoints);
  return Number(
    (numerator + BigInt(HUNDRED_PERCENT_BASIS_POINTS / 2)) /
      BigInt(HUNDRED_PERCENT_BASIS_POINTS)
  );
}

function threshold(rule, key) {
  return rule.applies_if[key]?.value ?? null;
}

function activeRolesForMonth(project, month) {
  return project.roles.filter(
    (role) => role.startMonth <= month && role.endMonth >= month
  );
}

function baseDecision(rule, status, reason, employerCost = 0) {
  return {
    ruleId: rule.id,
    area: rule.area,
    status,
    reason,
    employerCost,
    sourceLaw: rule.source_law,
    sourceSection: rule.source_section,
    lastVerified: rule.last_verified,
    confidence: rule.confidence,
    referToProfessionalIf: rule.refer_to_professional_if
  };
}

function evaluateContribution(rule, role, activeHeadcount, _activeMonths) {
  if (!rule.applies_if.contract_types.includes(role.contractType)) {
    return baseDecision(rule, "not_applicable", "result.reason.contractType");
  }
  const minimumHeadcount = threshold(rule, "minimum_headcount");
  if (minimumHeadcount === null) {
    return baseDecision(rule, "pending", "result.reason.missingThreshold");
  }
  if (activeHeadcount < minimumHeadcount) {
    return baseDecision(rule, "not_applicable", "result.reason.headcountBelow");
  }
  const ceiling = rule.applies_if.monthly_wage_at_most?.value ?? null;
  if (ceiling !== null && role.monthlySalary > ceiling) {
    return baseDecision(rule, "not_applicable", "result.reason.wageAbove");
  }
  const calculationCeiling = rule.calculation.wage_ceiling_monthly?.value;
  const wage =
    rule.calculation.wage_basis === "capped_at_ceiling" &&
    calculationCeiling !== undefined
      ? Math.min(role.monthlySalary, calculationCeiling)
      : role.monthlySalary;
  const rate = rule.calculation.rate_basis_points?.value;
  if (!Number.isSafeInteger(rate) || !Number.isSafeInteger(wage)) {
    return baseDecision(rule, "pending", "result.reason.missingRate");
  }
  return baseDecision(
    rule,
    "needs_verification",
    "result.reason.scenarioEstimate",
    safeMoneyRound(wage * role.headcount, rate)
  );
}

function evaluateGratuity(rule, role, activeMonths) {
  if (!rule.applies_if.contract_types.includes(role.contractType)) {
    return baseDecision(rule, "not_applicable", "result.reason.contractType");
  }
  const rate = rule.calculation.rate_basis_points?.value;
  if (!Number.isSafeInteger(rate)) {
    return baseDecision(rule, "pending", "result.reason.missingRate");
  }
  const thresholdMonths =
    role.contractType === "employee_fixed"
      ? rule.calculation.fixed_term_eligibility_months?.value
      : rule.calculation.permanent_eligibility_months?.value;
  const eligibility =
    Number.isSafeInteger(thresholdMonths) && activeMonths >= thresholdMonths;
  const monthlyAccrual = safeMoneyRound(
    role.monthlySalary * role.headcount,
    rate
  );
  return {
    ...baseDecision(
      rule,
      "needs_verification",
      eligibility
        ? "result.reason.gratuityPotentiallyEligible"
        : "result.reason.gratuityAccrual",
      monthlyAccrual
    ),
    accruedLiability: monthlyAccrual * activeMonths
  };
}

function evaluateMinimumWage(rule, role, stateCode, rulesData) {
  if (!rule.applies_if.contract_types.includes(role.contractType)) {
    return baseDecision(rule, "not_applicable", "result.reason.contractType");
  }
  const stateData = rulesData.state_minimum_wages?.[stateCode];
  if (!stateData || stateData.rates.length === 0 || !role.skillCategory) {
    return baseDecision(rule, "pending", "result.reason.minimumWageMissing");
  }
  const wageRate = stateData.rates.find(
    (rate) =>
      rate.skill_category === role.skillCategory &&
      Number.isSafeInteger(rate.monthly_minimum_wage)
  );
  if (!wageRate) {
    return baseDecision(rule, "pending", "result.reason.minimumWageMissing");
  }
  return baseDecision(
    rule,
    role.monthlySalary < wageRate.monthly_minimum_wage
      ? "needs_verification"
      : "not_applicable",
    role.monthlySalary < wageRate.monthly_minimum_wage
      ? "result.reason.minimumWageBelow"
      : "result.reason.minimumWageMet"
  );
}

function evaluatePosh(rule, role, activeHeadcount, monthlyCostPerWorker) {
  const minimum = threshold(rule, "screening_headcount");
  if (minimum === null) {
    return baseDecision(rule, "pending", "result.reason.missingThreshold");
  }
  return baseDecision(
    rule,
    activeHeadcount >= minimum ? "needs_verification" : "not_applicable",
    activeHeadcount >= minimum
      ? "result.reason.poshScreening"
      : "result.reason.headcountBelow",
    activeHeadcount >= minimum ? monthlyCostPerWorker * role.headcount : 0
  );
}

function evaluateClassification(rule, role, activeMonths) {
  const signals = rule.calculation.signals;
  const indicators = [
    {
      id: "hours",
      present: role.weeklyHours >= signals.hours_at_least_weekly.value
    },
    {
      id: "control",
      present: role.controlledByOrganization === true
    },
    {
      id: "regularPayment",
      present: role.regularPayment === true
    },
    {
      id: "duration",
      present: activeMonths >= signals.duration_at_least_months.value
    }
  ];
  const count = indicators.filter((indicator) => indicator.present).length;
  return {
    ...baseDecision(
      rule,
      count > 0 ? "needs_verification" : "not_applicable",
      "result.reason.classificationSignals"
    ),
    indicators,
    signalCount: count,
    signalTotal: indicators.length
  };
}

function evaluateRuleForMonth(rule, role, context) {
  const { headcount, activeMonths, project, rulesData } = context;
  if (rule.area === "epf" || rule.area === "esi") {
    return evaluateContribution(rule, role, headcount, activeMonths);
  }
  if (rule.area === "gratuity") {
    return evaluateGratuity(rule, role, activeMonths);
  }
  if (rule.area === "minimum_wage") {
    return evaluateMinimumWage(rule, role, project.state, rulesData);
  }
  if (rule.area === "posh") {
    return evaluatePosh(
      rule,
      role,
      headcount,
      project.poshMonthlyCostPerWorker
    );
  }
  return evaluateClassification(rule, role, activeMonths);
}

/**
 * Evaluate all configured rules for each active role in each grant month.
 * @param {object} project Normalized project inputs.
 * @param {{rules: object[], state_minimum_wages: object}} rulesData Editable rules data.
 * @returns {object[]} Monthly role-level rule decisions with source and verification metadata.
 */
export function evaluateRules(project, rulesData) {
  const monthlyEvaluations = [];
  for (let month = 1; month <= project.grantDurationMonths; month += 1) {
    const activeRoles = activeRolesForMonth(project, month);
    const activeHeadcount = activeRoles
      .filter((role) => EMPLOYEE_CONTRACTS.has(role.contractType))
      .reduce((total, role) => total + role.headcount, 0);
    for (const role of activeRoles) {
      const activeMonths = month - role.startMonth + 1;
      const context = {
        headcount: activeHeadcount,
        activeMonths,
        project,
        rulesData
      };
      monthlyEvaluations.push({
        month,
        roleId: role.id,
        headcount: role.headcount,
        items: rulesData.rules.map((rule) =>
          evaluateRuleForMonth(rule, role, context)
        )
      });
    }
  }
  return monthlyEvaluations;
}

/**
 * Sum salary and provisional employer-cost scenarios by role and across the grant.
 * @param {object} project Normalized project inputs.
 * @param {object[]} evaluations Output from evaluateRules.
 * @returns {object} Role totals and project monthly/grant totals.
 */
export function calculateStaffCosts(project, evaluations) {
  const roles = project.roles.map((role) => {
    const activeEvaluations = evaluations.filter(
      (item) => item.roleId === role.id
    );
    const salary =
      activeEvaluations.length * role.monthlySalary * role.headcount;
    const employerCosts = activeEvaluations.reduce(
      (total, item) =>
        total +
        item.items
          .filter(
            (rule) =>
              ESTIMATED_COST_RULES.has(rule.area) &&
              rule.status === "needs_verification"
          )
          .reduce((cost, rule) => cost + rule.employerCost, 0),
      0
    );
    const monthlyCosts = Array.from(
      { length: project.grantDurationMonths + POST_GRANT_MONTHS },
      (_, index) => {
        const month = index + 1;
        const evaluation = activeEvaluations.find(
          (item) => item.month === month
        );
        const salary = evaluation ? role.monthlySalary * role.headcount : 0;
        const monthlyEmployerCosts =
          evaluation?.items
            .filter(
              (rule) =>
                ESTIMATED_COST_RULES.has(rule.area) &&
                rule.status === "needs_verification"
            )
            .reduce((total, rule) => total + rule.employerCost, 0) || 0;
        return {
          month,
          salary,
          employerCosts: monthlyEmployerCosts,
          total: salary + monthlyEmployerCosts
        };
      }
    );
    return {
      roleId: role.id,
      salary,
      employerCosts,
      monthlyCosts,
      estimatedTotal: salary + employerCosts
    };
  });
  const salary = roles.reduce((total, role) => total + role.salary, 0);
  const employerCosts = roles.reduce(
    (total, role) => total + role.employerCosts,
    0
  );
  const monthly = project.roles.reduce(
    (total, role) =>
      total +
      (role.startMonth <= 1 && role.endMonth >= 1
        ? role.monthlySalary * role.headcount
        : 0),
    0
  );
  return {
    roles,
    monthlySalary: monthly,
    salary,
    estimatedEmployerCosts: employerCosts,
    estimatedTotal: salary + employerCosts
  };
}

/**
 * Calculate an illustrative compliance gap using configured scenario costs.
 * @param {object} project Normalized project inputs.
 * @param {object} costs Output from calculateStaffCosts.
 * @returns {object} Gap rupees, percentage, and budget/denominator totals.
 */
export function calculateComplianceGap(project, costs) {
  const gap = costs.estimatedEmployerCosts - project.complianceAllowance;
  const denominator = BigInt(costs.estimatedTotal);
  const absoluteGap = BigInt(Math.abs(gap));
  const roundedScore =
    costs.estimatedTotal > 0
      ? Number(
          (absoluteGap * BigInt(HUNDRED_PERCENT_BASIS_POINTS) +
            denominator / 2n) /
            denominator
        ) * Math.sign(gap)
      : null;
  return {
    gap,
    scoreBasisPoints: roundedScore,
    denominator: costs.estimatedTotal,
    budgetedStaffCost: costs.salary + project.complianceAllowance,
    requiredEmployerCostEstimate: costs.estimatedEmployerCosts
  };
}

/**
 * Build grant and three-month post-grant snapshots with accrued gratuity estimates.
 * @param {object} project Normalized project inputs.
 * @param {object[]} evaluations Output from evaluateRules.
 * @param {object} costs Output from calculateStaffCosts.
 * @returns {object} Timeline snapshots and end-date unfunded liability estimate.
 */
export function calculateGrantCliff(project, evaluations, costs) {
  const endMonth = project.grantDurationMonths;
  const endEvaluations = evaluations.filter((item) => item.month === endMonth);
  const coverage = endEvaluations.filter((entry) =>
    entry.items.some(
      (rule) =>
        ["epf", "esi"].includes(rule.area) &&
        rule.status === "needs_verification"
    )
  );
  const coveredRoleIds = new Set(coverage.map((entry) => entry.roleId));
  const lostCoverageRuleIds = [
    ...new Set(
      endEvaluations.flatMap((entry) =>
        entry.items
          .filter(
            (rule) =>
              ["epf", "esi"].includes(rule.area) &&
              rule.status === "needs_verification"
          )
          .map((rule) => rule.ruleId)
      )
    )
  ];
  const lostCoverageHeadcount = project.roles
    .filter((role) => coveredRoleIds.has(role.id))
    .reduce((total, role) => total + role.headcount, 0);
  const totalGratuityAccrual = project.roles.reduce((total, role) => {
    const finalWorkMonth = Math.min(endMonth, role.endMonth);
    const lastWorkingEvaluation = evaluations.find(
      (entry) => entry.roleId === role.id && entry.month === finalWorkMonth
    );
    const liability =
      lastWorkingEvaluation?.items
        .filter(
          (rule) =>
            rule.area === "gratuity" && rule.status === "needs_verification"
        )
        .reduce((sum, rule) => sum + rule.accruedLiability, 0) || 0;
    return total + liability;
  }, 0);
  const timeline = [];
  for (let month = 1; month <= endMonth + POST_GRANT_MONTHS; month += 1) {
    const grantEnded = month > endMonth;
    const accruedThroughMonth = project.roles.reduce((total, role) => {
      const finalWorkMonth = Math.min(month, endMonth, role.endMonth);
      const latestEvaluation = evaluations.find(
        (entry) => entry.roleId === role.id && entry.month === finalWorkMonth
      );
      const liability =
        latestEvaluation?.items
          .filter(
            (rule) =>
              rule.area === "gratuity" && rule.status === "needs_verification"
          )
          .reduce((sum, rule) => sum + rule.accruedLiability, 0) || 0;
      return total + liability;
    }, 0);
    const monthlyAccruedLiability = grantEnded
      ? totalGratuityAccrual
      : accruedThroughMonth;
    timeline.push({
      month,
      grantEnded,
      activeHeadcount: grantEnded
        ? 0
        : activeRolesForMonth(project, month).reduce(
            (total, role) => total + role.headcount,
            0
          ),
      lostCoverageHeadcount: grantEnded ? lostCoverageHeadcount : 0,
      lostCoverageRuleIds: grantEnded ? lostCoverageRuleIds : [],
      accruedGratuityEstimate: monthlyAccruedLiability
    });
  }
  return {
    timeline,
    grantEndMonth: endMonth,
    postGrantMonths: POST_GRANT_MONTHS,
    lostCoverageHeadcount,
    lostCoverageRuleIds,
    unfundedLiabilityEstimate: Math.max(
      0,
      totalGratuityAccrual - project.complianceAllowance
    ),
    estimatedEmployerCostAtGrantEnd: costs.estimatedEmployerCosts
  };
}

/**
 * Run the full deterministic calculation pipeline for a normalized project.
 * @param {object} project Normalized project inputs.
 * @param {object} rulesData Rules and state-specific minimum-wage records.
 * @returns {object} Rule evaluations, costs, gap score, and grant-cliff timeline.
 */
export function calculateProject(project, rulesData) {
  const evaluations = evaluateRules(project, rulesData);
  const costs = calculateStaffCosts(project, evaluations);
  return {
    evaluations,
    costs,
    gap: calculateComplianceGap(project, costs),
    cliff: calculateGrantCliff(project, evaluations, costs)
  };
}
