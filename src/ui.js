import {
  CONTRACT_TYPES,
  GENDER_MIX_OPTIONS,
  GRANT_DURATION_MAX_MONTHS,
  MAX_COMPLIANCE_ALLOWANCE_RUPEES,
  MAX_GRANT_AMOUNT_RUPEES,
  MAX_HEADCOUNT,
  MAX_MONTHLY_SALARY_RUPEES,
  MAX_POSH_PLANNING_COST_RUPEES,
  MAX_ROLE_SALARY_SLIDER,
  MAX_WEEKLY_HOURS,
  STATES,
  SUPPORTED_LANGUAGES,
  UNVERIFIED_DATE
} from "./constants.js";
import { renderCostChart, renderGrantTimeline } from "./charts.js";
import { generateFunderPack } from "./funderPack.js";
import { formatMoney } from "../money.js";
import {
  getApplicationState,
  loadProject,
  setActiveView,
  setFunderLanguage,
  setLanguage,
  setNotice,
  setSelectedRole,
  setTimelineMonth,
  updateProject
} from "./state.js";

const CONTRACT_LABELS = {
  employee_fixed: "contract.employeeFixed",
  employee_permanent: "contract.employeePermanent",
  consultant: "contract.consultant",
  volunteer_stipend: "contract.volunteerStipend"
};
const GENDER_LABELS = {
  unspecified: "gender.unspecified",
  women: "gender.women",
  men: "gender.men",
  mixed: "gender.mixed"
};
let translations;
let sampleProject;
let mountPoint;
let onAbout = () => {};

function translate(
  key,
  language = getApplicationState().language,
  replacements = {}
) {
  const entry = translations[language]?.[key];
  let value = typeof entry === "string" ? entry : entry?.text || key;
  for (const [name, replacement] of Object.entries(replacements)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character]
  );
}

function options(values, selected, labels, language) {
  return values
    .map(
      (value) =>
        `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(translate(labels[value], language))}</option>`
    )
    .join("");
}

function languageOptions(selected, language) {
  const labelKeys = { en: "language.en", hi: "language.hi", mr: "language.mr" };
  return options(SUPPORTED_LANGUAGES, selected, labelKeys, language);
}

function errorMarkup(errors, name, language) {
  const key = errors[name];
  return `<span class="field-error" data-error-for="${escapeHtml(name)}">${key ? escapeHtml(translate(key, language)) : ""}</span>`;
}

function field({
  label,
  name,
  value,
  type = "text",
  errors,
  language,
  min,
  max,
  step = 1,
  optional = false
}) {
  const inputId = `input-${name.replaceAll(".", "-")}`;
  const invalid = Boolean(errors[name]);
  return `<div class="field">
    <label for="${inputId}">${escapeHtml(translate(label, language))}${optional ? ` <span class="optional">${escapeHtml(translate("form.optional", language))}</span>` : ""}</label>
    <input id="${inputId}" name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value ?? "")}"${type === "number" ? ` min="${min}" max="${max}" step="${step}" inputmode="numeric"` : ""} aria-invalid="${invalid}" aria-describedby="${inputId}-error">
    <span class="field-error" id="${inputId}-error" data-error-for="${escapeHtml(name)}">${invalid ? escapeHtml(translate(errors[name], language)) : ""}</span>
  </div>`;
}

function selectField({ label, name, value, values, labels, errors, language }) {
  const inputId = `input-${name.replaceAll(".", "-")}`;
  const invalid = Boolean(errors[name]);
  return `<div class="field">
    <label for="${inputId}">${escapeHtml(translate(label, language))}</label>
    <select id="${inputId}" name="${escapeHtml(name)}" aria-invalid="${invalid}" aria-describedby="${inputId}-error">${options(values, value, labels, language)}</select>
    <span class="field-error" id="${inputId}-error" data-error-for="${escapeHtml(name)}">${invalid ? escapeHtml(translate(errors[name], language)) : ""}</span>
  </div>`;
}

function booleanField({ label, name, value, errors, language }) {
  const labels = { true: "common.yes", false: "common.no" };
  return `<div class="field">
    <label for="input-${name.replaceAll(".", "-")}">${escapeHtml(translate(label, language))}</label>
    <select id="input-${name.replaceAll(".", "-")}" name="${escapeHtml(name)}" aria-invalid="${Boolean(errors[name])}">
      ${options(["true", "false"], String(value), labels, language)}
    </select>
    ${errorMarkup(errors, name, language)}
  </div>`;
}

function renderRole(role, index, state) {
  const { language, validation, project } = state;
  const errors = validation.errors;
  const fields = [
    field({
      label: "role.title",
      name: `roles.${index}.title`,
      value: role.title,
      errors,
      language
    }),
    field({
      label: "role.headcount",
      name: `roles.${index}.headcount`,
      value: role.headcount,
      type: "number",
      min: 1,
      max: MAX_HEADCOUNT,
      errors,
      language
    }),
    field({
      label: "role.salary",
      name: `roles.${index}.monthlySalary`,
      value: role.monthlySalary,
      type: "number",
      min: 0,
      max: MAX_MONTHLY_SALARY_RUPEES,
      errors,
      language
    }),
    selectField({
      label: "role.gender",
      name: `roles.${index}.genderMix`,
      value: role.genderMix,
      values: GENDER_MIX_OPTIONS,
      labels: GENDER_LABELS,
      errors,
      language
    }),
    selectField({
      label: "role.contract",
      name: `roles.${index}.contractType`,
      value: role.contractType,
      values: CONTRACT_TYPES,
      labels: CONTRACT_LABELS,
      errors,
      language
    }),
    field({
      label: "role.hours",
      name: `roles.${index}.weeklyHours`,
      value: role.weeklyHours,
      type: "number",
      min: 0,
      max: MAX_WEEKLY_HOURS,
      errors,
      language
    }),
    booleanField({
      label: "role.regularPayment",
      name: `roles.${index}.regularPayment`,
      value: role.regularPayment,
      errors,
      language
    }),
    booleanField({
      label: "role.control",
      name: `roles.${index}.controlledByOrganization`,
      value: role.controlledByOrganization,
      errors,
      language
    }),
    field({
      label: "role.startMonth",
      name: `roles.${index}.startMonth`,
      value: role.startMonth,
      type: "number",
      min: 1,
      max: Number(project.grantDurationMonths) + 1,
      errors,
      language
    }),
    field({
      label: "role.endMonth",
      name: `roles.${index}.endMonth`,
      value: role.endMonth,
      type: "number",
      min: 1,
      max: Number(project.grantDurationMonths) + 1,
      errors,
      language
    }),
    field({
      label: "role.skillCategory",
      name: `roles.${index}.skillCategory`,
      value: role.skillCategory || "",
      errors,
      language,
      optional: true
    })
  ].join("");
  const salary = Number(role.monthlySalary) || 0;
  const people = Number(role.headcount) || 1;
  return `<fieldset class="role-card">
    <legend>${escapeHtml(role.title || translate("role.title", language))}</legend>
    <input type="hidden" name="roles.${index}.id" value="${escapeHtml(role.id)}">
    <div class="role-fields">${fields}</div>
    <div class="what-if-controls">
      <label for="salary-range-${index}">${escapeHtml(translate("role.whatIfSalary", language))}</label>
      <input id="salary-range-${index}" type="range" min="0" max="${MAX_ROLE_SALARY_SLIDER}" step="500" value="${Math.min(salary, MAX_ROLE_SALARY_SLIDER)}" data-sync="roles.${index}.monthlySalary" aria-label="${escapeHtml(translate("role.whatIfSalary", language))}">
      <label for="headcount-range-${index}">${escapeHtml(translate("role.whatIfHeadcount", language))}</label>
      <input id="headcount-range-${index}" type="range" min="1" max="${MAX_HEADCOUNT}" step="1" value="${people}" data-sync="roles.${index}.headcount" aria-label="${escapeHtml(translate("role.whatIfHeadcount", language))}">
    </div>
    <button class="button button-quiet remove-role" type="button" data-remove-role="${index}">${escapeHtml(translate("form.removeRole", language))}</button>
  </fieldset>`;
}

function renderProjectForm(state) {
  const { project, validation, language } = state;
  const errors = validation.errors;
  const stateLabels = Object.fromEntries(
    Object.keys(STATES).map((code) => [code, `state.${code}`])
  );
  const stateOptions = Object.keys(STATES)
    .map(
      (code) =>
        `<option value="${code}"${project.state === code ? " selected" : ""}>${escapeHtml(translate(stateLabels[code], language))}</option>`
    )
    .join("");
  const duration = Number(project.grantDurationMonths) || 1;
  const projectFields = [
    field({
      label: "form.projectName",
      name: "name",
      value: project.name,
      errors,
      language
    }),
    `<div class="field"><label for="input-state">${escapeHtml(translate("form.state", language))}</label><select id="input-state" name="state" aria-invalid="${Boolean(errors.state)}"><option value="">${escapeHtml(translate("form.selectState", language))}</option>${stateOptions}</select>${errorMarkup(errors, "state", language)}</div>`,
    field({
      label: "form.grantStart",
      name: "grantStartDate",
      value: project.grantStartDate,
      type: "date",
      errors,
      language
    }),
    field({
      label: "form.duration",
      name: "grantDurationMonths",
      value: project.grantDurationMonths,
      type: "number",
      min: 1,
      max: GRANT_DURATION_MAX_MONTHS,
      errors,
      language
    }),
    field({
      label: "form.grantAmount",
      name: "grantAmount",
      value: project.grantAmount,
      type: "number",
      min: 0,
      max: MAX_POSH_PLANNING_COST_RUPEES,
      errors,
      language,
      optional: true
    }),
    field({
      label: "form.allowance",
      name: "complianceAllowance",
      value: project.complianceAllowance,
      type: "number",
      min: 0,
      max: MAX_GRANT_AMOUNT_RUPEES,
      errors,
      language
    }),
    field({
      label: "form.poshCost",
      name: "poshMonthlyCostPerWorker",
      value: project.poshMonthlyCostPerWorker,
      type: "number",
      min: 0,
      max: MAX_COMPLIANCE_ALLOWANCE_RUPEES,
      errors,
      language,
      optional: true
    })
  ].join("");
  return `<form id="project-form" novalidate>
    <section class="panel input-panel">
      <div class="section-title"><div><p class="eyebrow">${escapeHtml(translate("app.inputsEyebrow", language))}</p><h2>${escapeHtml(translate("form.title", language))}</h2></div>
        <button class="button button-secondary" type="button" data-action="load-sample">${escapeHtml(translate("app.trySample", language))}</button>
      </div>
      <div class="form-grid">${projectFields}</div>
      <div class="duration-slider"><label for="duration-range">${escapeHtml(translate("role.whatIfDuration", language))}</label><input id="duration-range" type="range" min="1" max="60" step="1" value="${duration}" data-sync="grantDurationMonths" aria-label="${escapeHtml(translate("role.whatIfDuration", language))}"></div>
      <div class="section-title roles-heading"><h3>${escapeHtml(translate("form.rolesTitle", language))}</h3><button class="button button-secondary" type="button" data-action="add-role">${escapeHtml(translate("form.addRole", language))}</button></div>
      <div class="role-list">${project.roles.map((role, index) => renderRole(role, index, state)).join("") || `<p class="empty-state">${escapeHtml(translate("dashboard.noRoles", language))}</p>`}</div>
    </section>
  </form>`;
}

function formatPercent(basisPoints) {
  return (basisPoints / 100).toFixed(1);
}

function ruleStatusKey(status) {
  return status === "needs_verification"
    ? "rule.needsVerification"
    : status === "pending"
      ? "rule.pending"
      : "rule.notApplicable";
}

function renderRuleDecision(item, rule, language, workerView = false) {
  const metadata = `<dl class="rule-metadata">
    <div><dt>${escapeHtml(translate("rule.source", language))}</dt><dd>${escapeHtml(item.sourceLaw)}</dd></div>
    <div><dt>${escapeHtml(translate("rule.section", language))}</dt><dd>${escapeHtml(item.sourceSection)}</dd></div>
    <div><dt>${escapeHtml(translate("rule.lastVerified", language))}</dt><dd>${escapeHtml(item.lastVerified)}</dd></div>
    <div><dt>${escapeHtml(translate("rule.confidence", language))}</dt><dd>${escapeHtml(translate(`confidence.${item.confidence}`, language))}</dd></div>
  </dl>`;
  const signalText =
    item.signalCount === undefined
      ? ""
      : `<p class="classification-score">${escapeHtml(translate("rule.classificationScore", language, { count: item.signalCount, total: item.signalTotal }))}</p>`;
  const verificationBadge =
    item.lastVerified === UNVERIFIED_DATE &&
    item.status !== "needs_verification"
      ? `<span class="status-badge status-needs_verification">${escapeHtml(translate("rule.needsVerification", language))}</span>`
      : "";
  const workerExplanation = workerView
    ? rule.worker_explanation[language]?.text ||
      rule.worker_explanation[language] ||
      rule.worker_explanation.en
    : "";
  return `<article class="rule-result">
    <div class="rule-result-heading"><h4>${escapeHtml(rule.name[language]?.text || rule.name[language] || rule.name.en)}</h4><div class="status-list">${verificationBadge}<span class="status-badge status-${escapeHtml(item.status)}">${escapeHtml(translate(ruleStatusKey(item.status), language))}</span></div></div>
    <p>${escapeHtml(translate(item.reason, language))}</p>
    ${workerView ? `<p class="worker-explanation">${escapeHtml(workerExplanation)}</p>` : ""}
    ${signalText}
    <p>${escapeHtml(rule.note[language]?.text || rule.note[language] || rule.note.en)}</p>
    <p><strong>${escapeHtml(translate("rule.professional", language))}:</strong> ${escapeHtml(item.referToProfessionalIf)}</p>
    <p><strong>${escapeHtml(translate("rule.cost", language))}:</strong> ${escapeHtml(item.employerCost ? formatMoney(item.employerCost) : translate("rule.noCost", language))}</p>
    ${metadata}
  </article>`;
}

function findNumericRuleInputs(value, path = "", entries = []) {
  if (!value || typeof value !== "object") {
    return entries;
  }
  if (typeof value.value === "number") {
    entries.push({
      path,
      value: value.value,
      lastVerified: value.last_verified
    });
    return entries;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "last_verified") {
      findNumericRuleInputs(child, path ? `${path}.${key}` : key, entries);
    }
  }
  return entries;
}

function getRoleEvaluations(state, roleId) {
  if (!state.calculation) {
    return [];
  }
  return state.calculation.evaluations.filter((item) => item.roleId === roleId);
}

function selectedRoleMonthEvaluation(state, roleId) {
  const entries = getRoleEvaluations(state, roleId);
  if (entries.length === 0) {
    return null;
  }
  const grantMonth = Math.min(
    state.timelineMonth,
    state.project.grantDurationMonths
  );
  return (
    entries.filter((item) => item.month <= grantMonth).at(-1) || entries[0]
  );
}

function renderRoleCostRow(
  role,
  total,
  language,
  rulesData,
  monthEvaluation,
  selectedMonth
) {
  const monthCosts = total.monthlyCosts.find(
    (item) => item.month === selectedMonth
  );
  const roleId = escapeHtml(role.id);
  const rulesById = new Map(rulesData.rules.map((rule) => [rule.id, rule]));
  const details = renderRoleRuleDetails(
    roleId,
    language,
    monthEvaluation,
    rulesById
  );
  return `<article class="role-result-card">
    <div class="role-cost-summary">
      <h3>${escapeHtml(role.title)}</h3>
      <dl>
        <div><dt>${escapeHtml(translate("dashboard.monthlyAt", language, { month: selectedMonth }))} · ${escapeHtml(translate("dashboard.monthlySalary", language))}</dt><dd data-month-value="salary" data-role-id="${roleId}">${escapeHtml(formatMoney(monthCosts?.salary || 0))}</dd></div>
        <div><dt>${escapeHtml(translate("dashboard.salaryTotal", language))}</dt><dd>${escapeHtml(formatMoney(total.salary))}</dd></div>
        <div><dt>${escapeHtml(translate("dashboard.monthlyEmployerCost", language))}</dt><dd data-month-value="employerCosts" data-role-id="${roleId}">${escapeHtml(formatMoney(monthCosts?.employerCosts || 0))}</dd></div>
        <div><dt>${escapeHtml(translate("dashboard.employerTotal", language))}</dt><dd>${escapeHtml(formatMoney(total.employerCosts))}</dd></div>
        <div><dt>${escapeHtml(translate("dashboard.monthlyTotal", language))}</dt><dd data-month-value="total" data-role-id="${roleId}">${escapeHtml(formatMoney(monthCosts?.total || 0))}</dd></div>
        <div><dt>${escapeHtml(translate("dashboard.staffTotal", language))}</dt><dd>${escapeHtml(formatMoney(total.estimatedTotal))}</dd></div>
      </dl>
    </div>
    ${details}
  </article>`;
}

function renderRoleRuleDetails(roleId, language, monthEvaluation, rulesById) {
  const details = monthEvaluation
    ? `<details class="rule-details"><summary>${escapeHtml(translate("dashboard.details", language))}</summary><div class="rule-results">
      ${monthEvaluation.items.map((item) => renderRuleDecision(item, rulesById.get(item.ruleId), language)).join("")}
    </div></details>`
    : `<p>${escapeHtml(translate("dashboard.noRoles", language))}</p>`;
  return `<div id="role-rules-${roleId}">${details}</div>`;
}

function renderGapSummary(state) {
  const { calculation, language } = state;
  if (!calculation) {
    return `<p class="error-inline">${escapeHtml(translate("dashboard.fixInputs", language))}</p>`;
  }
  const { gap, costs } = calculation;
  const summary =
    gap.scoreBasisPoints === null
      ? translate("dashboard.noSalary", language)
      : gap.gap >= 0
        ? translate("dashboard.underfunded", language, {
            amount: formatMoney(gap.gap),
            percentage: formatPercent(gap.scoreBasisPoints)
          })
        : translate("dashboard.surplus", language, {
            amount: formatMoney(Math.abs(gap.gap))
          });
  const score =
    gap.scoreBasisPoints === null
      ? "—"
      : `${formatPercent(gap.scoreBasisPoints)}%`;
  return `<div class="estimate-banner"><span class="risk-icon" aria-hidden="true">!</span><p>${escapeHtml(translate("dashboard.estimateNotice", language))}</p></div>
    <section class="gap-score-card" aria-label="${escapeHtml(translate("dashboard.gapScore", language))}">
      <p class="eyebrow">${escapeHtml(translate("dashboard.gapScore", language))}</p><strong class="gap-number">${escapeHtml(score)}</strong>
      <p>${escapeHtml(summary)}</p>
    </section>
    <div class="metric-grid">
      ${metric("dashboard.salaryCost", costs.salary, language)}
      ${metric("dashboard.employerCost", costs.estimatedEmployerCosts, language)}
      ${metric("dashboard.trueCost", costs.estimatedTotal, language)}
      ${metric("dashboard.complianceGap", gap.gap, language)}
      ${metric("dashboard.budgetedCost", gap.budgetedStaffCost, language)}
      ${state.project.grantAmount === null ? "" : metric("dashboard.grantAmount", state.project.grantAmount, language)}
    </div>`;
}

function metric(label, amount, language) {
  return `<article class="metric-card"><p>${escapeHtml(translate(label, language))}</p><strong>${escapeHtml(formatMoney(amount))}</strong></article>`;
}

function renderCliff(state) {
  const { calculation, language, timelineMonth } = state;
  const { cliff } = calculation;
  const point = cliff.timeline.find((item) => item.month === timelineMonth);
  const sliderMax = cliff.timeline.length;
  return `<section class="panel cliff-panel">
    <div class="section-title"><div><h2>${escapeHtml(translate("dashboard.cliff", language))}</h2><p>${escapeHtml(translate("dashboard.cliffDescription", language))}</p></div>
      <label class="compact-field" for="timeline-range">${escapeHtml(translate("dashboard.month", language))}: ${timelineMonth}<input id="timeline-range" type="range" min="1" max="${sliderMax}" value="${timelineMonth}"></label>
    </div>
    <div id="timeline-chart-container">${renderGrantTimeline(cliff.timeline, timelineMonth, (key) => translate(key, language))}</div>
    <div class="cliff-summary" id="cliff-summary">
      <p>${escapeHtml(translate("dashboard.cliffEnd", language, { month: cliff.grantEndMonth }))}</p>
      <p>${escapeHtml(translate("dashboard.activeWorkers", language, { count: point.activeHeadcount }))}</p>
      <p>${escapeHtml(translate("dashboard.coverageEnd", language, { count: cliff.lostCoverageHeadcount }))}</p>
      <p>${escapeHtml(
        translate("dashboard.protectionsStop", language, {
          protections: cliff.lostCoverageRuleIds
            .map((id) => translate(`ruleName.${id}`, language))
            .join(", ")
        })
      )}</p>
      <p>${escapeHtml(translate("dashboard.liability", language, { amount: formatMoney(point.accruedGratuityEstimate) }))}</p>
      <p><strong>${escapeHtml(translate("dashboard.liabilityUnfunded", language, { amount: formatMoney(cliff.unfundedLiabilityEstimate) }))}</strong></p>
    </div>
  </section>`;
}

function updateTimelinePresentation() {
  const state = getApplicationState();
  const cliff = state.calculation.cliff;
  const point = cliff.timeline.find(
    (item) => item.month === state.timelineMonth
  );
  mountPoint.querySelector("#timeline-chart-container").innerHTML =
    renderGrantTimeline(cliff.timeline, state.timelineMonth, (key) =>
      translate(key, state.language)
    );
  mountPoint.querySelector("#cliff-summary").innerHTML = renderCliffSummary(
    state,
    point
  );
  for (const roleTotal of state.calculation.costs.roles) {
    const monthCost = roleTotal.monthlyCosts.find(
      (item) => item.month === state.timelineMonth
    );
    for (const key of ["salary", "employerCosts", "total"]) {
      const value = monthCost?.[key] || 0;
      const output = mountPoint.querySelector(
        `[data-role-id="${CSS.escape(roleTotal.roleId)}"][data-month-value="${key}"]`
      );
      if (output) {
        output.textContent = formatMoney(value);
      }
    }
    const rulesById = new Map(
      state.rulesData.rules.map((rule) => [rule.id, rule])
    );
    const details = mountPoint.querySelector(
      `#role-rules-${CSS.escape(roleTotal.roleId)}`
    );
    if (details) {
      details.innerHTML = renderRoleRuleDetails(
        escapeHtml(roleTotal.roleId),
        state.language,
        selectedRoleMonthEvaluation(state, roleTotal.roleId),
        rulesById
      );
    }
  }
  const label = mountPoint.querySelector("#timeline-range")?.parentElement;
  if (label?.firstChild) {
    label.firstChild.textContent = `${translate("dashboard.month", state.language)}: ${state.timelineMonth}`;
  }
}

function renderCliffSummary(state, point) {
  const { cliff } = state.calculation;
  const language = state.language;
  return `<p>${escapeHtml(translate("dashboard.cliffEnd", language, { month: cliff.grantEndMonth }))}</p>
    <p>${escapeHtml(translate("dashboard.activeWorkers", language, { count: point.activeHeadcount }))}</p>
    <p>${escapeHtml(translate("dashboard.coverageEnd", language, { count: cliff.lostCoverageHeadcount }))}</p>
    <p>${escapeHtml(
      translate("dashboard.protectionsStop", language, {
        protections: cliff.lostCoverageRuleIds
          .map((id) => translate(`ruleName.${id}`, language))
          .join(", ")
      })
    )}</p>
    <p>${escapeHtml(translate("dashboard.liability", language, { amount: formatMoney(point.accruedGratuityEstimate) }))}</p>
    <p><strong>${escapeHtml(translate("dashboard.liabilityUnfunded", language, { amount: formatMoney(cliff.unfundedLiabilityEstimate) }))}</strong></p>`;
}

function renderNgoResults(state) {
  const { calculation, language, project } = state;
  if (!calculation) {
    return renderGapSummary(state);
  }
  const roleTotals = new Map(
    calculation.costs.roles.map((item) => [item.roleId, item])
  );
  const breakdown = project.roles
    .map((role) =>
      renderRoleCostRow(
        role,
        roleTotals.get(role.id),
        language,
        state.rulesData,
        selectedRoleMonthEvaluation(state, role.id),
        Math.min(state.timelineMonth, state.calculation.cliff.grantEndMonth + 3)
      )
    )
    .join("");
  return `
    <div class="section-title results-heading"><div><p class="eyebrow">${escapeHtml(translate("app.resultsEyebrow", language))}</p><h2>${escapeHtml(translate("dashboard.title", language))}</h2></div></div>
    ${renderGapSummary(state)}
    <div class="panel chart-panel"><h2>${escapeHtml(translate("dashboard.breakdown", language))}</h2>${renderCostChart(calculation.evaluations, (key) => translate(key, language), formatMoney)}</div>
    ${renderCliff(state)}
    <section class="panel role-breakdown"><h2>${escapeHtml(translate("dashboard.roleBreakdown", language))}</h2>${breakdown || `<p>${escapeHtml(translate("dashboard.noRoles", language))}</p>`}</section>`;
}

function renderWorkerView(state) {
  const { project, language, selectedRoleId, calculation, rulesData } = state;
  const role = project.roles.find((item) => item.id === selectedRoleId);
  const roleOptions = project.roles
    .map(
      (item) =>
        `<option value="${escapeHtml(item.id)}"${item.id === selectedRoleId ? " selected" : ""}>${escapeHtml(item.title)}</option>`
    )
    .join("");
  const evaluation = role ? selectedRoleMonthEvaluation(state, role.id) : null;
  const mappedRules = new Map(rulesData.rules.map((item) => [item.id, item]));
  const decisions = evaluation
    ? evaluation.items
        .map((item) =>
          renderRuleDecision(item, mappedRules.get(item.ruleId), language, true)
        )
        .join("")
    : `<p class="empty-state">${escapeHtml(translate("dashboard.noRoles", language))}</p>`;
  const missingProtections =
    evaluation?.items
      .filter((item) => item.status !== "needs_verification")
      .map((item) =>
        renderRuleDecision(item, mappedRules.get(item.ruleId), language, true)
      )
      .join("") ||
    `<p class="empty-state">${escapeHtml(translate("worker.missingInformation", language))}</p>`;
  const cliffMessage = calculation
    ? translate("worker.grantEnd", language)
    : translate("worker.missingInformation", language);
  return `<section class="panel worker-panel">
    <p class="eyebrow">${escapeHtml(translate("view.workerTitle", language))}</p>
    <h1>${escapeHtml(translate("view.workerTitle", language))}</h1>
    <p class="intro">${escapeHtml(translate("view.workerIntro", language))}</p>
    <div class="field worker-role-select"><label for="worker-role">${escapeHtml(translate("worker.selectRole", language))}</label><select id="worker-role">${roleOptions}</select></div>
    <h2>${escapeHtml(translate("worker.possibleProtections", language))}</h2>
    <div class="rule-results">${decisions}</div>
    <h2>${escapeHtml(translate("worker.protectionsMissing", language))}</h2>
    <p>${escapeHtml(translate("worker.missingInformation", language))}</p>
    <div class="rule-results">${missingProtections}</div>
    <aside class="worker-question"><p>${escapeHtml(translate("worker.askEmployer", language))}</p><p>${escapeHtml(cliffMessage)}</p></aside>
  </section>`;
}

function renderRulesView(state) {
  const { language, rulesData } = state;
  const rules = rulesData.rules
    .map((rule) => {
      const labels = Object.entries(rule.applies_if)
        .map(([key, value]) => {
          const displayValue = Array.isArray(value)
            ? value
                .map((contract) =>
                  translate(CONTRACT_LABELS[contract] || contract, language)
                )
                .join(", ")
            : typeof value === "object"
              ? (value.value ?? "—")
              : String(value);
          return `<li>${escapeHtml(translate(`ruleField.${key}`, language))}: ${escapeHtml(displayValue)}${value?.last_verified ? ` <span class="status-badge">${escapeHtml(value.last_verified)}</span>` : ""}</li>`;
        })
        .join("");
      const calculation = findNumericRuleInputs(rule.calculation, "calculation")
        .map(
          ({ path, value, lastVerified }) =>
            `<li>${escapeHtml(translate(`ruleField.${path}`, language))}: ${escapeHtml(value)} <span class="status-badge">${escapeHtml(lastVerified)}</span></li>`
        )
        .join("");
      const calculationMethod = translate(
        `ruleCalculation.${rule.calculation.type}`,
        language
      );
      const wageBasis = rule.calculation.wage_basis
        ? `<li>${escapeHtml(translate("ruleField.wage_basis", language))}: ${escapeHtml(translate(`ruleWageBasis.${rule.calculation.wage_basis}`, language))}</li>`
        : "";
      const workerExplanation =
        rule.worker_explanation[language]?.text ||
        rule.worker_explanation[language] ||
        rule.worker_explanation.en;
      return `<article class="rule-audit-card">
      <div class="rule-result-heading"><h2>${escapeHtml(rule.name[language]?.text || rule.name[language] || rule.name.en)}</h2><span class="status-badge status-needs_verification">${escapeHtml(translate("rule.needsVerification", language))}</span></div>
      <p>${escapeHtml(rule.note[language]?.text || rule.note[language] || rule.note.en)}</p>
      <p>${escapeHtml(workerExplanation)}</p>
      <dl class="rule-metadata">
        <div><dt>${escapeHtml(translate("rule.source", language))}</dt><dd>${escapeHtml(rule.source_law)}</dd></div>
        <div><dt>${escapeHtml(translate("rule.section", language))}</dt><dd>${escapeHtml(rule.source_section)}</dd></div>
        <div><dt>${escapeHtml(translate("rule.lastVerified", language))}</dt><dd>${escapeHtml(rule.last_verified)}</dd></div>
        <div><dt>${escapeHtml(translate("rule.confidence", language))}</dt><dd>${escapeHtml(translate(`confidence.${rule.confidence}`, language))}</dd></div>
      </dl>
      <h3>${escapeHtml(translate("rules.thresholds", language))}</h3><ul><li>${escapeHtml(translate("ruleField.type", language))}: ${escapeHtml(calculationMethod)}</li>${labels || `<li>${escapeHtml(translate("rules.noThreshold", language))}</li>`}${calculation}${wageBasis}</ul>
      <p><strong>${escapeHtml(translate("rule.professional", language))}:</strong> ${escapeHtml(rule.refer_to_professional_if)}</p>
    </article>`;
    })
    .join("");
  return `<section class="panel rules-panel"><p class="eyebrow">${escapeHtml(translate("view.rulesTitle", language))}</p><h1>${escapeHtml(translate("view.rulesTitle", language))}</h1><p class="intro">${escapeHtml(translate("view.rulesIntro", language))}</p><div class="rule-audit-list">${rules}</div></section>`;
}

function renderFunderView(state) {
  const { project, rulesData, calculation, funderLanguage } = state;
  const translateFunder = (key) => translate(key, funderLanguage);
  if (!calculation || !state.validation.valid) {
    return `<section class="panel funder-panel" lang="${escapeHtml(funderLanguage)}">
      <div class="section-title"><h1>${escapeHtml(translate("view.funderTitle", funderLanguage))}</h1>
        <label class="language-control"><span>${escapeHtml(translate("language.funder", funderLanguage))}</span><select id="funder-language">${languageOptions(funderLanguage, funderLanguage)}</select></label>
      </div>
      <p>${escapeHtml(translate("dashboard.fixInputs", funderLanguage))}</p>
    </section>`;
  }
  const note = generateFunderPack(
    state.validation.value,
    rulesData,
    calculation,
    translateFunder,
    formatMoney
  );
  const escapedNote = escapeHtml(note);
  const roleRows = calculation.costs.roles
    .map((item) => {
      const role = project.roles.find((entry) => entry.id === item.roleId);
      return `<tr><th scope="row">${escapeHtml(role.title)}</th><td>${escapeHtml(formatMoney(item.salary))}</td><td>${escapeHtml(formatMoney(item.employerCosts))}</td><td>${escapeHtml(formatMoney(item.estimatedTotal))}</td></tr>`;
    })
    .join("");
  const allowanceShare =
    calculation.costs.salary > 0
      ? (
          (calculation.costs.estimatedEmployerCosts * 100) /
          calculation.costs.salary
        ).toFixed(1)
      : "0.0";
  return `<section class="panel funder-panel" lang="${escapeHtml(funderLanguage)}">
    <p class="eyebrow">${escapeHtml(translate("view.funderTitle", funderLanguage))}</p>
    <div class="section-title"><div><h1>${escapeHtml(translate("view.funderTitle", funderLanguage))}</h1><p>${escapeHtml(translate("view.funderIntro", funderLanguage))}</p></div>
      <label class="language-control"><span>${escapeHtml(translate("language.funder", funderLanguage))}</span><select id="funder-language">${languageOptions(funderLanguage, funderLanguage)}</select></label>
    </div>
    <div class="funder-actions"><button class="button button-primary" data-action="copy-funder" type="button">${escapeHtml(translate("funder.copy", funderLanguage))}</button><button class="button button-secondary" data-action="print" type="button">${escapeHtml(translate("funder.print", funderLanguage))}</button></div>
    <p class="live-notice" id="funder-notice" aria-live="polite">${state.notice ? escapeHtml(translate(state.notice, funderLanguage)) : ""}</p>
    <p>${escapeHtml(translate("funder.recommendedAllowance", funderLanguage))}: <strong>${escapeHtml(allowanceShare)}%</strong></p>
    <p>${escapeHtml(translate("funder.justification", funderLanguage))}</p>
    <div class="funder-table-wrap"><table class="funder-table">
      <thead><tr><th scope="col">${escapeHtml(translate("dashboard.role", funderLanguage))}</th><th scope="col">${escapeHtml(translate("dashboard.salaryTotal", funderLanguage))}</th><th scope="col">${escapeHtml(translate("dashboard.employerTotal", funderLanguage))}</th><th scope="col">${escapeHtml(translate("dashboard.staffTotal", funderLanguage))}</th></tr></thead>
      <tbody>${roleRows}
        <tr class="total-row"><th scope="row">${escapeHtml(translate("dashboard.total", funderLanguage))}</th><td>${escapeHtml(formatMoney(calculation.costs.salary))}</td><td>${escapeHtml(formatMoney(calculation.costs.estimatedEmployerCosts))}</td><td>${escapeHtml(formatMoney(calculation.costs.estimatedTotal))}</td></tr>
        <tr><th scope="row">${escapeHtml(translate("form.allowance", funderLanguage))}</th><td colspan="2"></td><td>${escapeHtml(formatMoney(project.complianceAllowance))}</td></tr>
        <tr><th scope="row">${escapeHtml(translate("dashboard.budgetedCost", funderLanguage))}</th><td colspan="2"></td><td>${escapeHtml(formatMoney(calculation.gap.budgetedStaffCost))}</td></tr>
      </tbody>
    </table></div>
    <div class="funder-note"><h2>${escapeHtml(translate("funder.copyNote", funderLanguage))}</h2><pre id="funder-note-text">${escapedNote}</pre></div>
  </section>`;
}

function renderActiveView(state) {
  if (state.activeView === "ngo") {
    return `${renderProjectForm(state)}<section id="live-results" aria-live="polite">${renderNgoResults(state)}</section>`;
  }
  if (state.activeView === "worker") {
    return renderWorkerView(state);
  }
  if (state.activeView === "rules") {
    return renderRulesView(state);
  }
  return renderFunderView(state);
}

function renderApp() {
  const state = getApplicationState();
  const { language, activeView } = state;
  document.documentElement.lang = language;
  document.title = translate("app.name", language);
  mountPoint.innerHTML = `<header class="topbar">
    <a class="brand" href="./">${escapeHtml(translate("app.name", language))}</a>
    <button class="about-link" type="button" data-action="about">${escapeHtml(translate("welcome.about", language))}</button>
    <label class="language-control"><span>${escapeHtml(translate("language.label", language))}</span><select id="worker-language">${languageOptions(language, language)}</select></label>
  </header>
  <main>
    <section class="hero"><p class="eyebrow">${escapeHtml(translate("app.heroEyebrow", language))}</p><h1 tabindex="-1">${escapeHtml(translate("app.tagline", language))}</h1><p>${escapeHtml(translate("app.heroNote", language))}</p></section>
    <nav class="tabs" aria-label="${escapeHtml(translate("app.name", language))}">
      ${navButton("ngo", "nav.ngo", activeView, language)}
      ${navButton("worker", "nav.worker", activeView, language)}
      ${navButton("rules", "nav.rules", activeView, language)}
      ${navButton("funder", "nav.funder", activeView, language)}
    </nav>
    <p class="live-notice" id="global-notice" aria-live="polite">${state.notice ? escapeHtml(translate(state.notice, language)) : ""}</p>
    <section id="active-view" role="tabpanel" tabindex="0" aria-labelledby="tab-${activeView}">${renderActiveView(state)}</section>
    <aside class="notice">${escapeHtml(translate("notice.disclaimer", language))}</aside>
  </main>`;
  bindEvents();
}

function navButton(view, label, activeView, language) {
  return `<button class="tab" id="tab-${view}" type="button" data-view="${view}" aria-current="${activeView === view ? "page" : "false"}" aria-controls="active-view">${escapeHtml(translate(label, language))}</button>`;
}

function readNumber(value) {
  return value === "" ? Number.NaN : Number(value);
}

function collectProject() {
  const form = mountPoint.querySelector("#project-form");
  if (!form) {
    return getApplicationState().project;
  }
  const project = getApplicationState().project;
  const value = (name) => form.elements.namedItem(name)?.value ?? "";
  const roles = project.roles.map((role, index) => {
    const roleValue = (fieldName) =>
      form.elements.namedItem(`roles.${index}.${fieldName}`)?.value ?? "";
    return {
      id: roleValue("id"),
      title: roleValue("title"),
      headcount: readNumber(roleValue("headcount")),
      monthlySalary: readNumber(roleValue("monthlySalary")),
      genderMix: roleValue("genderMix"),
      contractType: roleValue("contractType"),
      weeklyHours: readNumber(roleValue("weeklyHours")),
      regularPayment: roleValue("regularPayment") === "true",
      controlledByOrganization:
        roleValue("controlledByOrganization") === "true",
      startMonth: readNumber(roleValue("startMonth")),
      endMonth: readNumber(roleValue("endMonth")),
      skillCategory: roleValue("skillCategory").trim()
    };
  });
  const grantAmount = value("grantAmount");
  return {
    ...project,
    name: value("name"),
    state: value("state"),
    grantStartDate: value("grantStartDate"),
    grantDurationMonths: readNumber(value("grantDurationMonths")),
    grantAmount: grantAmount === "" ? null : readNumber(grantAmount),
    complianceAllowance: readNumber(value("complianceAllowance")),
    poshMonthlyCostPerWorker: readNumber(value("poshMonthlyCostPerWorker")),
    roles
  };
}

function syncRangeValue(target) {
  const targetName = target.dataset.sync;
  if (!targetName) {
    return;
  }
  const paired = mountPoint.querySelector(`[name="${CSS.escape(targetName)}"]`);
  if (paired) {
    paired.value = target.value;
  }
}

function syncInputToRange(target) {
  if (!target.name || target.type === "range") {
    return;
  }
  const range = mountPoint.querySelector(
    `[data-sync="${CSS.escape(target.name)}"]`
  );
  if (range) {
    range.value = String(
      Math.min(
        Number(range.max),
        Math.max(Number(range.min), Number(target.value) || 0)
      )
    );
  }
}

function updateFromForm() {
  updateProject(collectProject());
  updateRenderedFormFeedback();
}

function updateRenderedFormFeedback() {
  const state = getApplicationState();
  for (const errorNode of mountPoint.querySelectorAll("[data-error-for]")) {
    const errorKey = state.validation.errors[errorNode.dataset.errorFor];
    errorNode.textContent = errorKey ? translate(errorKey, state.language) : "";
  }
  for (const input of mountPoint.querySelectorAll(
    "#project-form input, #project-form select"
  )) {
    const name = input.name;
    if (name) {
      input.setAttribute(
        "aria-invalid",
        String(Boolean(state.validation.errors[name]))
      );
    }
  }
  const resultArea = mountPoint.querySelector("#live-results");
  if (resultArea && state.activeView === "ngo") {
    resultArea.innerHTML = renderNgoResults(state);
  }
  const notice = mountPoint.querySelector("#global-notice");
  if (notice) {
    notice.textContent = state.notice
      ? translate(state.notice, state.language)
      : "";
  }
  document.title = translate("app.name", state.language);
}

function addRole() {
  const project = collectProject();
  const nextIndex = project.roles.length + 1;
  project.roles.push({
    id: `role-${Date.now()}-${nextIndex}`,
    title: "",
    headcount: 1,
    monthlySalary: 0,
    genderMix: "unspecified",
    contractType: "employee_fixed",
    weeklyHours: 40,
    regularPayment: true,
    controlledByOrganization: true,
    startMonth: 1,
    endMonth: Math.max(1, Number(project.grantDurationMonths) || 1),
    skillCategory: ""
  });
  updateProject(project);
  renderApp();
  mountPoint
    .querySelector(".role-card:last-child input:not([type=hidden])")
    ?.focus();
}

function removeRole(index) {
  const project = collectProject();
  project.roles.splice(index, 1);
  updateProject(project);
  renderApp();
}

async function copyFunderNote() {
  const note = mountPoint.querySelector("#funder-note-text")?.textContent || "";
  try {
    await navigator.clipboard.writeText(note);
    setNotice("funder.copied");
  } catch {
    setNotice("funder.copyError");
  }
  renderApp();
}

function bindEvents() {
  mountPoint.oninput = (event) => {
    const target = event.target;
    if (target.id === "timeline-range") {
      setTimelineMonth(Number(target.value));
      updateTimelinePresentation();
      return;
    }
    if (target.matches("[data-sync]")) {
      syncRangeValue(target);
    } else {
      syncInputToRange(target);
    }
    if (target.closest("#project-form")) {
      updateFromForm();
    }
  };
  mountPoint.onchange = (event) => {
    const target = event.target;
    if (target.id === "worker-language") {
      setLanguage(target.value);
      try {
        localStorage.setItem("kamgar-compass-language", target.value);
      } catch {
        setNotice("language.storageError");
      }
      renderApp();
    } else if (target.id === "funder-language") {
      setFunderLanguage(target.value);
      renderApp();
    } else if (target.id === "worker-role") {
      setSelectedRole(target.value);
      renderApp();
    } else if (target.closest("#project-form")) {
      updateFromForm();
    }
  };
  mountPoint.onkeydown = (event) => {
    if (!event.target.matches(".tabs [data-view]")) {
      return;
    }
    const views = [...mountPoint.querySelectorAll(".tabs [data-view]")];
    const currentIndex = views.indexOf(event.target);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % views.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + views.length) % views.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? views.length - 1
              : -1;
    if (nextIndex >= 0) {
      event.preventDefault();
      const nextView = views[nextIndex].dataset.view;
      setActiveView(nextView);
      renderApp();
      mountPoint.querySelector(`#tab-${CSS.escape(nextView)}`).focus();
    }
  };
  mountPoint.onclick = (event) => {
    const target = event.target.closest(
      "[data-view], [data-action], [data-remove-role]"
    );
    if (!target) {
      return;
    }
    if (target.dataset.view) {
      setActiveView(target.dataset.view);
      renderApp();
    } else if (target.dataset.action === "load-sample") {
      loadProject(sampleProject);
      setNotice("form.sampleLoaded");
      renderApp();
    } else if (target.dataset.action === "add-role") {
      addRole();
    } else if (target.dataset.removeRole !== undefined) {
      removeRole(Number(target.dataset.removeRole));
    } else if (target.dataset.action === "copy-funder") {
      copyFunderNote();
    } else if (target.dataset.action === "print") {
      window.print();
    } else if (target.dataset.action === "about") {
      onAbout();
    }
  };
}

/**
 * Mount the application UI and attach event handlers.
 * @param {HTMLElement} element Application root.
 * @param {object} data Loaded locales and project/rules data.
 * @returns {void}
 */
export function mountApplication(element, data) {
  mountPoint = element;
  translations = data.locales;
  sampleProject = data.sampleProject;
  onAbout = data.onAbout || (() => {});
  renderApp();
}
