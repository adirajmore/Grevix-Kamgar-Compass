/**
 * Create printable, copyable proposal text from project inputs and calculations.
 * @param {object} project Validated project input.
 * @param {object} rulesData Editable legal rules.
 * @param {object} calculation Calculated project summary.
 * @param {(key: string, args?: object) => string} translate Translation lookup.
 * @param {(amount: number) => string} formatMoney Currency formatter.
 * @returns {string} Plain-text Funder Pack note.
 */
export function generateFunderPack(
  project,
  rulesData,
  calculation,
  translate,
  formatMoney
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
    translate("funder.justification"),
    ...laws,
    translate("dashboard.estimateNotice"),
    translate("notice.disclaimer")
  ].join("\n");
}
