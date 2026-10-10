import {
  CONTRACT_TYPES,
  GENDER_MIX_OPTIONS,
  GRANT_DURATION_MAX_MONTHS,
  GRANT_DURATION_MIN_MONTHS,
  MAX_COMPLIANCE_ALLOWANCE_RUPEES,
  MAX_GRANT_AMOUNT_RUPEES,
  MAX_HEADCOUNT,
  MAX_ROLES,
  MAX_MONTHLY_SALARY_RUPEES,
  MAX_POSH_PLANNING_COST_RUPEES,
  MAX_WEEKLY_HOURS,
  STATES
} from "./constants.js";

const PROJECT_NAME_MAX_LENGTH = 120;
const ROLE_TITLE_MAX_LENGTH = 100;
const ROLE_START_MONTH_MAX_AHEAD = 1;

function isWholeNumberInRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validateRequiredText(value, maximumLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maximumLength
  );
}

function validateRole(role, index, grantDurationMonths, errors) {
  const prefix = `roles.${index}`;
  if (!validateRequiredText(role.title, ROLE_TITLE_MAX_LENGTH)) {
    errors[`${prefix}.title`] = "validation.roleTitle";
  }
  if (!isWholeNumberInRange(role.headcount, 1, MAX_HEADCOUNT)) {
    errors[`${prefix}.headcount`] = "validation.headcount";
  }
  if (!isWholeNumberInRange(role.monthlySalary, 0, MAX_MONTHLY_SALARY_RUPEES)) {
    errors[`${prefix}.monthlySalary`] = "validation.salary";
  }
  if (!CONTRACT_TYPES.includes(role.contractType)) {
    errors[`${prefix}.contractType`] = "validation.contract";
  }
  if (!GENDER_MIX_OPTIONS.includes(role.genderMix)) {
    errors[`${prefix}.genderMix`] = "validation.gender";
  }
  if (typeof role.regularPayment !== "boolean") {
    errors[`${prefix}.regularPayment`] = "validation.regularPayment";
  }
  if (typeof role.controlledByOrganization !== "boolean") {
    errors[`${prefix}.controlledByOrganization`] = "validation.control";
  }
  if (!isWholeNumberInRange(role.weeklyHours, 0, MAX_WEEKLY_HOURS)) {
    errors[`${prefix}.weeklyHours`] = "validation.hours";
  }
  const lastRoleMonth = grantDurationMonths + ROLE_START_MONTH_MAX_AHEAD;
  if (!isWholeNumberInRange(role.startMonth, 1, lastRoleMonth)) {
    errors[`${prefix}.startMonth`] = "validation.startMonth";
  }
  if (!isWholeNumberInRange(role.endMonth, role.startMonth, lastRoleMonth)) {
    errors[`${prefix}.endMonth`] = "validation.endMonth";
  }
}

/**
 * Validate project input and return a normalized copy without mutating the caller's object.
 * @param {object} project Raw project form values.
 * @returns {{valid: boolean, value: object|null, errors: Record<string, string>}}
 */
export function validateProject(project) {
  const errors = {};
  if (!project || typeof project !== "object" || Array.isArray(project)) {
    return {
      valid: false,
      value: null,
      errors: { project: "validation.project" }
    };
  }

  const grantDurationMonths = project.grantDurationMonths;
  if (!validateRequiredText(project.name, PROJECT_NAME_MAX_LENGTH)) {
    errors.name = "validation.projectName";
  }
  if (
    typeof project.state !== "string" ||
    !Object.hasOwn(STATES, project.state)
  ) {
    errors.state = "validation.state";
  }
  if (!isValidDate(project.grantStartDate)) {
    errors.grantStartDate = "validation.startDate";
  }
  if (
    !isWholeNumberInRange(
      grantDurationMonths,
      GRANT_DURATION_MIN_MONTHS,
      GRANT_DURATION_MAX_MONTHS
    )
  ) {
    errors.grantDurationMonths = "validation.duration";
  }
  if (
    project.grantAmount !== null &&
    project.grantAmount !== undefined &&
    !isWholeNumberInRange(project.grantAmount, 0, MAX_GRANT_AMOUNT_RUPEES)
  ) {
    errors.grantAmount = "validation.grantAmount";
  }
  if (
    !isWholeNumberInRange(
      project.complianceAllowance ?? 0,
      0,
      MAX_COMPLIANCE_ALLOWANCE_RUPEES
    )
  ) {
    errors.complianceAllowance = "validation.allowance";
  }
  if (
    !isWholeNumberInRange(
      project.poshMonthlyCostPerWorker ?? 0,
      0,
      MAX_POSH_PLANNING_COST_RUPEES
    )
  ) {
    errors.poshMonthlyCostPerWorker = "validation.poshCost";
  }
  if (!Array.isArray(project.roles)) {
    errors.roles = "validation.roles";
  } else if (project.roles.length > MAX_ROLES) {
    errors.roles = "validation.roleLimit";
  } else if (Number.isSafeInteger(grantDurationMonths)) {
    project.roles.forEach((role, index) =>
      validateRole(role || {}, index, grantDurationMonths, errors)
    );
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, value: null, errors };
  }
  return { valid: true, value: normalizeProject(project), errors };
}

/**
 * Parse and validate a real calendar date in ISO YYYY-MM-DD format.
 * @param {unknown} value Candidate date.
 * @returns {boolean} Whether the value is a valid calendar date.
 */
export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Return a trimmed immutable project copy and defaults after validation succeeds.
 * @param {object} project Valid project input.
 * @returns {object} Normalized project.
 */
export function normalizeProject(project) {
  return {
    ...project,
    name: project.name.trim(),
    grantAmount: project.grantAmount ?? null,
    complianceAllowance: project.complianceAllowance ?? 0,
    poshMonthlyCostPerWorker: project.poshMonthlyCostPerWorker ?? 0,
    roles: project.roles.map((role, index) => ({
      ...role,
      id: role.id || `role-${index + 1}`,
      title: role.title.trim()
    }))
  };
}
