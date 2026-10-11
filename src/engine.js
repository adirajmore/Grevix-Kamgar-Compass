import {
  HUNDRED_PERCENT_BASIS_POINTS,
  MAX_RESERVE_MONTHS,
  POST_GRANT_MONTHS,
  RULE_FRESHNESS_THRESHOLDS
} from "./constants.js";
import { classifyFreshness, getAsOfDate, getRuleAgeDays } from "./freshness.js";

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

function ruleIsRelevant(ruleId, evaluations) {
  return evaluations.some((evaluation) =>
    evaluation.items.some(
      (item) =>
        item.ruleId === ruleId &&
        (item.status === "needs_verification" || item.status === "pending")
    )
  );
}

function estimateRuleFactors(rule, asOfDate, thresholds) {
  const freshness = classifyFreshness(rule, asOfDate, thresholds);
  if (freshness === "fresh") {
    return {
      freshness,
      ageDays: getRuleAgeDays(rule, asOfDate),
      factors: [1, 1, 1]
    };
  }
  const ageDays = getRuleAgeDays(rule, asOfDate);
  const assumption = rule.drift_assumption;
  const lowPct = assumption?.annual_change_low_pct;
  const highPct = assumption?.annual_change_high_pct;
  if (
    ageDays === null ||
    !Number.isFinite(lowPct) ||
    !Number.isFinite(highPct) ||
    lowPct < 0 ||
    highPct < lowPct
  ) {
    return { freshness, ageDays, factors: null };
  }
  const annualFraction = ageDays / 36500;
  const lowFactor = 1 + (lowPct * annualFraction) / 100;
  const highFactor = 1 + (highPct * annualFraction) / 100;
  return {
    freshness,
    ageDays,
    factors: [lowFactor, (lowFactor + highFactor) / 2, highFactor]
  };
}

function scaleEvaluationCosts(evaluations, rulesById, factorIndex) {
  return evaluations.map((evaluation) => ({
    ...evaluation,
    items: evaluation.items.map((item) => {
      const factors = rulesById.get(item.ruleId)?.factors;
      if (!factors || item.employerCost === 0) {
        return item;
      }
      return {
        ...item,
        employerCost: Math.round(item.employerCost * factors[factorIndex]),
        ...(Number.isSafeInteger(item.accruedLiability)
          ? {
              accruedLiability: Math.round(
                item.accruedLiability * factors[factorIndex]
              )
            }
          : {})
      };
    })
  }));
}

/**
 * Estimate uncertainty ranges without modifying the standard calculation.
 * Unverified exposures without a usable age remain explicitly unquantifiable.
 * @param {object} project Normalized project inputs.
 * @param {object} rulesData Editable rules data.
 * @param {object[]} evaluations Output from evaluateRules.
 * @param {object} costs Output from calculateStaffCosts.
 * @param {object} options Date and cautious-mode options.
 * @returns {object|null} Cautious estimates, or null when all relevant rules are fresh.
 */
function calculateUncertainty(
  project,
  rulesData,
  evaluations,
  costs,
  { asOfDate, forceCautious = false, thresholds = RULE_FRESHNESS_THRESHOLDS }
) {
  const date = getAsOfDate(asOfDate);
  const relevantRules = rulesData.rules.filter((rule) =>
    ruleIsRelevant(rule.id, evaluations)
  );
  const rulesById = new Map();
  const ruleDetails = [];
  for (const rule of relevantRules) {
    const currentCost = evaluations
      .flatMap((evaluation) => evaluation.items)
      .filter((item) => item.ruleId === rule.id)
      .reduce((total, item) => total + item.employerCost, 0);
    const hasMissingFinancialInput = evaluations.some((evaluation) =>
      evaluation.items.some(
        (item) =>
          item.ruleId === rule.id &&
          item.status === "pending" &&
          ["epf", "esi", "minimum_wage", "posh"].includes(rule.area)
      )
    );
    const estimate = hasMissingFinancialInput
      ? { freshness: "unverified", ageDays: null, factors: null }
      : estimateRuleFactors(rule, date, thresholds);
    const hasUnknownExposure =
      hasMissingFinancialInput ||
      (estimate.factors === null && currentCost > 0);
    rulesById.set(rule.id, {
      ...estimate,
      factors: estimate.factors || [1, 1, 1],
      hasUnknownExposure
    });
    ruleDetails.push({
      ruleId: rule.id,
      area: rule.area,
      freshness: estimate.freshness,
      ageDays: estimate.ageDays,
      currentCost,
      assumption: rule.drift_assumption
        ? {
            lowPct: rule.drift_assumption.annual_change_low_pct,
            highPct: rule.drift_assumption.annual_change_high_pct,
            basis: rule.drift_assumption.basis
          }
        : null,
      unquantifiable: hasUnknownExposure
    });
  }

  const cautious =
    forceCautious ||
    relevantRules.some((rule) => rulesById.get(rule.id).freshness !== "fresh");
  if (!cautious) {
    return null;
  }

  const scenarios = [0, 1, 2].map((factorIndex) => {
    const scaled = scaleEvaluationCosts(evaluations, rulesById, factorIndex);
    const scenarioCosts = calculateStaffCosts(project, scaled);
    return {
      costs: scenarioCosts,
      gap: calculateComplianceGap(project, scenarioCosts),
      cliff: calculateGrantCliff(project, scaled, scenarioCosts)
    };
  });
  const unquantifiable = ruleDetails.some((rule) => rule.unquantifiable);
  const gapScores = scenarios
    .map((scenario) => scenario.gap.scoreBasisPoints)
    .filter(Number.isFinite);
  const quantifiedGapLow = gapScores.length > 0 ? Math.min(...gapScores) : null;
  const quantifiedGapHigh =
    gapScores.length > 0 ? Math.max(...gapScores) : null;
  const gap = {
    low: unquantifiable ? null : quantifiedGapLow,
    expected: scenarios[1].gap.scoreBasisPoints,
    high: unquantifiable ? null : quantifiedGapHigh,
    quantified: {
      low: quantifiedGapLow,
      expected: scenarios[1].gap.scoreBasisPoints,
      high: quantifiedGapHigh
    }
  };

  return {
    mode: "cautious",
    asOfDate: date,
    limitedInformation: forceCautious,
    rules: ruleDetails,
    unquantifiableRuleIds: ruleDetails
      .filter((rule) => rule.unquantifiable)
      .map((rule) => rule.ruleId),
    costs: {
      low: scenarios[0].costs.estimatedEmployerCosts,
      expected: scenarios[1].costs.estimatedEmployerCosts,
      high: unquantifiable ? null : scenarios[2].costs.estimatedEmployerCosts,
      recommended: unquantifiable
        ? null
        : scenarios[2].costs.estimatedEmployerCosts,
      quantified: {
        low: scenarios[0].costs.estimatedEmployerCosts,
        expected: scenarios[1].costs.estimatedEmployerCosts,
        high: scenarios[2].costs.estimatedEmployerCosts
      },
      roles: costs.roles.map((role, index) => ({
        roleId: role.roleId,
        low: scenarios[0].costs.roles[index].employerCosts,
        expected: scenarios[1].costs.roles[index].employerCosts,
        high: unquantifiable
          ? null
          : scenarios[2].costs.roles[index].employerCosts
      }))
    },
    gap,
    cliff: {
      low: scenarios[0].cliff.unfundedLiabilityEstimate,
      expected: scenarios[1].cliff.unfundedLiabilityEstimate,
      high: unquantifiable
        ? null
        : scenarios[2].cliff.unfundedLiabilityEstimate,
      quantified: {
        low: scenarios[0].cliff.unfundedLiabilityEstimate,
        expected: scenarios[1].cliff.unfundedLiabilityEstimate,
        high: scenarios[2].cliff.unfundedLiabilityEstimate
      }
    }
  };
}

/**
 * Run the full deterministic calculation pipeline for a normalized project.
 * @param {object} project Normalized project inputs.
 * @param {object} rulesData Rules and state-specific minimum-wage records.
 * @param {object} [options] Optional uncertainty estimate settings.
 * @returns {object} Rule evaluations, costs, gap score, and grant-cliff timeline.
 */
export function calculateProject(project, rulesData, options = {}) {
  const evaluations = evaluateRules(project, rulesData);
  const costs = calculateStaffCosts(project, evaluations);
  const result = {
    evaluations,
    costs,
    gap: calculateComplianceGap(project, costs),
    cliff: calculateGrantCliff(project, evaluations, costs)
  };
  const uncertainty = calculateUncertainty(
    project,
    rulesData,
    evaluations,
    costs,
    options
  );
  return uncertainty ? { ...result, uncertainty } : result;
}

/**
 * Calculate monthly savings needed to cover the existing Grant Cliff liability.
 * @param {object} cliff Standard Grant Cliff calculation.
 * @param {object|null} uncertainCliff Optional cautious liability range.
 * @param {{monthsRemaining: number, startingReserve?: number, asOfDate?: string}} options Planner inputs.
 * @returns {object} Monthly set-aside bands, projected progress, and sufficiency dates.
 */
export function calculateReservePlan(cliff, uncertainCliff, options) {
  const monthsRemaining = options?.monthsRemaining;
  const startingReserve = options?.startingReserve ?? 0;
  if (
    !Number.isSafeInteger(monthsRemaining) ||
    monthsRemaining < 1 ||
    monthsRemaining > MAX_RESERVE_MONTHS
  ) {
    throw new TypeError(
      `Months remaining must be a whole number from 1 to ${MAX_RESERVE_MONTHS}.`
    );
  }
  if (!Number.isSafeInteger(startingReserve) || startingReserve < 0) {
    throw new TypeError(
      "Starting reserve must be a non-negative whole amount."
    );
  }
  const asOfDate = getAsOfDate(options.asOfDate);
  const liability = {
    low: uncertainCliff?.low ?? cliff.unfundedLiabilityEstimate,
    expected: uncertainCliff?.expected ?? cliff.unfundedLiabilityEstimate,
    high:
      uncertainCliff === null || uncertainCliff === undefined
        ? cliff.unfundedLiabilityEstimate
        : uncertainCliff?.high
  };
  for (const [band, amount] of Object.entries(liability)) {
    if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) {
      throw new TypeError(
        `The ${band} liability must be a non-negative amount.`
      );
    }
  }
  if (
    liability.low === null ||
    liability.expected === null ||
    (liability.high !== null &&
      (liability.low > liability.expected ||
        liability.expected > liability.high))
  ) {
    throw new TypeError("Reserve liability range is invalid.");
  }

  const monthlySetAside = Object.fromEntries(
    Object.entries(liability).map(([band, amount]) => [
      band,
      amount === null
        ? null
        : Math.ceil(Math.max(0, amount - startingReserve) / monthsRemaining)
    ])
  );
  const sufficientBy = Object.fromEntries(
    Object.entries(liability).map(([band, amount]) => {
      const monthly = monthlySetAside[band];
      if (amount === null || monthly === null) {
        return [band, null];
      }
      const shortfall = Math.max(0, amount - startingReserve);
      const monthsToSufficiency =
        shortfall === 0 ? 0 : Math.ceil(shortfall / monthly);
      return [band, addCalendarMonths(asOfDate, monthsToSufficiency)];
    })
  );
  const progress = Array.from({ length: monthsRemaining + 1 }, (_, month) => {
    const balance = Object.fromEntries(
      Object.entries(monthlySetAside).map(([band, monthly]) => [
        band,
        monthly === null ? null : startingReserve + monthly * month
      ])
    );
    const percentage = Object.fromEntries(
      Object.entries(balance).map(([band, amount]) => [
        band,
        amount === null
          ? null
          : liability[band] === 0
            ? 100
            : Math.min(100, (amount / liability[band]) * 100)
      ])
    );
    return {
      month,
      date: addCalendarMonths(asOfDate, month),
      balance,
      percentage
    };
  });
  return {
    asOfDate,
    monthsRemaining,
    startingReserve,
    liability,
    monthlySetAside,
    sufficientBy,
    progress
  };
}

/**
 * Build a role-specific, non-determinative Worker Rights Card data model.
 * @param {object} project Normalized project inputs.
 * @param {string} roleId Selected role identifier.
 * @param {object} calculation Project calculation output.
 * @param {object} rulesData Active rule pack.
 * @returns {object|null} Card data based on the role's last modeled work month.
 */
export function buildWorkerRightsCard(project, roleId, calculation, rulesData) {
  const role = project.roles.find((item) => item.id === roleId);
  if (!role || !calculation) {
    return null;
  }
  const lastWorkingMonth = Math.min(role.endMonth, project.grantDurationMonths);
  const evaluation = calculation.evaluations.find(
    (item) => item.roleId === role.id && item.month === lastWorkingMonth
  );
  const rulesById = new Map(rulesData.rules.map((rule) => [rule.id, rule]));
  const protections = (evaluation?.items || [])
    .map((decision) => {
      const rule = rulesById.get(decision.ruleId);
      if (!rule) {
        return null;
      }
      return {
        ruleId: decision.ruleId,
        status: decision.status,
        reason: decision.reason,
        lastVerified: decision.lastVerified,
        name: rule.name,
        workerExplanation: rule.worker_explanation
      };
    })
    .filter(Boolean);
  return {
    roleTitle: role.title,
    lastWorkingMonth,
    grantDurationMonths: project.grantDurationMonths,
    possibleProtections: protections.filter(
      (item) => item.status === "needs_verification"
    ),
    notConfirmedProtections: protections.filter(
      (item) => item.status !== "needs_verification"
    ),
    uncertain: Boolean(calculation.uncertainty)
  };
}

function addCalendarMonths(isoDate, months) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const firstOfTargetMonth = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();
  firstOfTargetMonth.setUTCDate(Math.min(day, lastDay));
  return firstOfTargetMonth.toISOString().slice(0, 10);
}

/**
 * Calculate comparable project metrics and deltas from the first saved scenario.
 * Cautious-mode values use the engine's expected scenario output.
 * @param {{id: string, name: string, project: object}[]} scenarios Named project snapshots.
 * @param {object} rulesData Rules used for every comparison.
 * @param {object} [options] Freshness and cautious-mode options.
 * @returns {object} Baseline, metrics, per-scenario deltas, and a factual summary.
 */
export function compareScenarios(scenarios, rulesData, options = {}) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    return { baselineId: null, scenarios: [], summary: null };
  }
  const baselineScenario = scenarios[0];
  const baselineCalculation = calculateProject(
    baselineScenario.project,
    rulesData,
    options
  );
  const baselineMetrics = scenarioMetrics(
    baselineScenario.project,
    baselineCalculation
  );
  const compared = scenarios.map((scenario) => {
    const calculation =
      scenario.id === baselineScenario.id
        ? baselineCalculation
        : calculateProject(scenario.project, rulesData, options);
    const metrics = scenarioMetrics(scenario.project, calculation);
    return {
      id: scenario.id,
      name: scenario.name,
      metrics,
      delta: {
        trueCost: metrics.trueCost - baselineMetrics.trueCost,
        averageMonthlyCost:
          metrics.averageMonthlyCost - baselineMetrics.averageMonthlyCost,
        gapScoreBasisPoints:
          metrics.gapScoreBasisPoints === null ||
          baselineMetrics.gapScoreBasisPoints === null
            ? null
            : metrics.gapScoreBasisPoints - baselineMetrics.gapScoreBasisPoints,
        unfundedLiability:
          metrics.unfundedLiability - baselineMetrics.unfundedLiability,
        classificationWarnings:
          metrics.classificationWarnings -
          baselineMetrics.classificationWarnings
      }
    };
  });
  return {
    baselineId: baselineScenario.id,
    scenarios: compared,
    summary: biggestScenarioChange(compared.slice(1))
  };
}

function scenarioMetrics(project, calculation) {
  const classificationRoles = new Set(
    calculation.evaluations
      .flatMap((month) =>
        month.items.map((item) => ({ ...item, roleId: month.roleId }))
      )
      .filter(
        (item) =>
          item.ruleId === "worker_classification" && item.signalCount > 0
      )
      .map((item) => item.roleId)
  );
  return {
    trueCost: calculation.costs.estimatedTotal,
    averageMonthlyCost:
      project.grantDurationMonths > 0
        ? Math.round(
            calculation.costs.estimatedTotal / project.grantDurationMonths
          )
        : 0,
    gapScoreBasisPoints: calculation.gap.scoreBasisPoints,
    unfundedLiability: calculation.cliff.unfundedLiabilityEstimate,
    classificationWarnings: classificationRoles.size
  };
}

function biggestScenarioChange(scenarios) {
  if (scenarios.length === 0) {
    return null;
  }
  const riskReduction = scenarios
    .filter((scenario) => scenario.delta.classificationWarnings < 0)
    .sort(
      (first, second) =>
        first.delta.classificationWarnings - second.delta.classificationWarnings
    )[0];
  if (riskReduction) {
    return {
      type: "classification_reduction",
      scenarioId: riskReduction.id,
      averageMonthlyCostDifference: riskReduction.delta.averageMonthlyCost,
      classificationWarningsRemoved: Math.abs(
        riskReduction.delta.classificationWarnings
      ),
      classificationWarningsChange: riskReduction.delta.classificationWarnings
    };
  }
  const largestCostChange = [...scenarios].sort(
    (first, second) =>
      Math.abs(second.delta.averageMonthlyCost) -
      Math.abs(first.delta.averageMonthlyCost)
  )[0];
  return {
    type: "cost_change",
    scenarioId: largestCostChange.id,
    averageMonthlyCostDifference: largestCostChange.delta.averageMonthlyCost,
    classificationWarningsRemoved: 0,
    classificationWarningsChange: largestCostChange.delta.classificationWarnings
  };
}
