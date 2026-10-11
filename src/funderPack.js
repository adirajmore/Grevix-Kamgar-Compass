import { getRuleAgeDays } from "./freshness.js";

/**
 * Create printable, copyable proposal text from project inputs and calculations.
 * @param {object} project Validated project input.
 * @param {object} rulesData Editable legal rules.
 * @param {object} calculation Calculated project summary.
 * @param {(key: string, args?: object) => string} translate Translation lookup.
 * @param {(amount: number) => string} formatMoney Currency formatter.
 * @param {string} [language="en"] Language used for rule names.
 * @returns {string} Plain-text Funder Pack note.
 */
export function generateFunderPack(
  project,
  rulesData,
  calculation,
  translate,
  formatMoney,
  language = "en",
  reconciliation = null,
  reservePlan = null
) {
  const allowancePercentage =
    calculation.costs.salary > 0
      ? (
          (calculation.costs.estimatedEmployerCosts * 100) /
          calculation.costs.salary
        ).toFixed(1)
      : "0.0";
  const roleRows = calculation.costs.roles.map((role) => {
    const details = project.roles.find((item) => item.id === role.roleId);
    return `${details.title}: ${formatMoney(role.salary)} salary; ${formatMoney(role.employerCosts)} illustrative employer costs; ${formatMoney(role.estimatedTotal)} estimated total.`;
  });
  const laws = rulesData.rules.map(
    (rule) =>
      `${rule.name.en}: ${rule.source_law} (${rule.source_section}; ${translate("rule.lastVerified")}: ${rule.last_verified}).`
  );
  const uncertainty = calculation.uncertainty;
  const basis = uncertainty
    ? createBasisOfEstimate(
        rulesData,
        uncertainty,
        translate,
        formatMoney,
        language,
        reconciliation
      )
    : [];
  return [
    project.name,
    `${translate("form.state")}: ${project.state}; ${translate("form.duration")}: ${project.grantDurationMonths}.`,
    ...(project.grantAmount === null
      ? []
      : [
          `${translate("dashboard.grantAmount")}: ${formatMoney(project.grantAmount)}.`
        ]),
    `${translate("dashboard.salaryCost")}: ${formatMoney(calculation.costs.salary)}.`,
    `${translate("dashboard.employerCost")}: ${formatMoney(calculation.costs.estimatedEmployerCosts)}.`,
    `${translate("funder.recommendedAllowance")}: ${allowancePercentage}%.`,
    ...roleRows,
    ...(reservePlan
      ? [formatReserveBudgetItem(reservePlan, translate, formatMoney)]
      : []),
    translate("funder.justification"),
    ...laws,
    ...basis,
    translate("dashboard.estimateNotice"),
    translate("notice.disclaimer")
  ].join("\n");
}

function formatReserveBudgetItem(reservePlan, translate, formatMoney) {
  return translate("reserve.funderLine", {
    monthly: formatMoney(reservePlan.monthlySetAside.expected),
    months: reservePlan.monthsRemaining,
    total: formatMoney(reservePlan.liability.expected),
    high:
      reservePlan.monthlySetAside.high === null
        ? translate("dashboard.rangeUnbounded")
        : formatMoney(reservePlan.monthlySetAside.high)
  });
}

function createBasisOfEstimate(
  rulesData,
  uncertainty,
  translate,
  formatMoney,
  language,
  reconciliation
) {
  const packAgeDays = getRuleAgeDays(
    { last_verified: rulesData.pack_date },
    uncertainty.asOfDate
  );
  const ruleById = new Map(rulesData.rules.map((rule) => [rule.id, rule]));
  const reviewRules = uncertainty.rules
    .filter((rule) => rule.freshness !== "fresh" || rule.unquantifiable)
    .sort((first, second) => second.currentCost - first.currentCost);
  const ruleRows = reviewRules.length
    ? reviewRules.map((rule) => {
        const name = ruleById.get(rule.ruleId)?.name;
        const localizedName =
          name?.[language]?.text || name?.[language] || name?.en || rule.area;
        const age =
          rule.ageDays === null
            ? translate("funder.unknownAge")
            : translate("funder.ageDays", { days: rule.ageDays });
        const assumption = rule.assumption
          ? translate("funder.driftAssumption", {
              low: rule.assumption.lowPct,
              high: rule.assumption.highPct
            })
          : translate("funder.assumptionUnavailable");
        return `${localizedName} | ${age} | ${translate(`freshness.${rule.freshness}`)} | ${assumption}`;
      })
    : [translate("funder.noStaleRules")];
  const verificationList = reviewRules.length
    ? reviewRules.map((rule, index) => {
        const name = ruleById.get(rule.ruleId)?.name;
        const localizedName =
          name?.[language]?.text || name?.[language] || name?.en || rule.area;
        return `${index + 1}. ${localizedName} — ${formatMoney(rule.currentCost)} ${translate("funder.currentScenarioCost")}`;
      })
    : [translate("funder.verifyAllRules")];
  const recommended =
    uncertainty.costs.recommended === null
      ? translate("funder.recommendationUnavailable")
      : formatMoney(uncertainty.costs.recommended);
  const snapshotAge =
    packAgeDays === null
      ? translate("funder.unknownAge")
      : translate("funder.ageDays", { days: packAgeDays });

  return [
    "",
    translate("funder.basisHeading"),
    `${translate("funder.rulesSnapshot")}: ${rulesData.pack_date || translate("funder.unknownDate")} (${snapshotAge}).`,
    `${translate("funder.estimateDate")}: ${uncertainty.asOfDate}.`,
    `${translate("funder.affectedRules")}:`,
    ...ruleRows,
    `${translate("funder.lowEstimate")}: ${formatMoney(uncertainty.costs.low)}.`,
    `${translate("funder.expectedEstimate")}: ${formatMoney(uncertainty.costs.expected)}.`,
    `${translate("funder.recommendedEstimate")}: ${recommended}.`,
    translate(
      uncertainty.costs.recommended === null
        ? "funder.uncertaintyUnquantifiable"
        : "funder.highEstimateMethod"
    ),
    translate("funder.cautiousStatement"),
    `${translate("funder.verifyBeforeSubmission")}:`,
    ...verificationList,
    translate("funder.reconciliation"),
    ...(reconciliation
      ? [
          translate("funder.reconciliationResult", {
            expected: formatMoney(reconciliation.expected),
            low: formatMoney(reconciliation.low),
            high: formatMoney(reconciliation.high),
            difference: formatMoney(reconciliation.difference),
            coverage: translate(
              reconciliation.withinQuantifiedRange
                ? "funder.reconciliationWithin"
                : "funder.reconciliationOutside",
              {
                bounded: reconciliation.fullRangeBounded
                  ? translate("funder.reconciliationBounded")
                  : translate("funder.reconciliationUnbounded")
              }
            )
          })
        ]
      : [])
  ];
}
