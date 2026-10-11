import { MAX_SAVED_SCENARIOS, SUPPORTED_LANGUAGES } from "./constants.js";
import { calculateProject, calculateReservePlan } from "./engine.js";
import { applyVerificationDateOverride, getAsOfDate } from "./freshness.js";
import { validateProject } from "./validation.js";

let applicationState = null;
let nextScenarioId = 1;

/**
 * Create the single application state from project data and browser preferences.
 * @param {object} sampleProject Validated sample project.
 * @param {object} rulesData Editable rule data.
 * @param {string|null} storedLanguage A persisted language preference.
 * @param {string[]} browserLanguages Browser language preference list.
 * @returns {object} Initialized immutable state snapshot.
 */
export function initializeState(
  sampleProject,
  rulesData,
  storedLanguage,
  browserLanguages,
  bundledRulesData = rulesData
) {
  nextScenarioId = 1;
  const browserLanguage = browserLanguages
    .map((language) => language.toLowerCase().split("-")[0])
    .find((language) => SUPPORTED_LANGUAGES.includes(language));
  const language = SUPPORTED_LANGUAGES.includes(storedLanguage)
    ? storedLanguage
    : browserLanguage || "en";
  applicationState = {
    project: structuredClone(sampleProject),
    bundledRulesData,
    baseRulesData: rulesData,
    rulesData: applyVerificationDateOverride(rulesData, null),
    language,
    funderLanguage: "en",
    asOfDate: getAsOfDate(),
    verifiedOnDate: "",
    limitedInformation: false,
    reconciliation: null,
    savedScenarios: [],
    reserveMonthsRemaining: sampleProject.grantDurationMonths,
    reserveStartingAmount: 0,
    reservePlan: null,
    activeView: "ngo",
    selectedRoleId: sampleProject.roles[0]?.id || null,
    timelineMonth: sampleProject.grantDurationMonths,
    validation: validateProject(sampleProject),
    calculation: calculateProject(sampleProject, rulesData, {
      asOfDate: getAsOfDate()
    }),
    notice: ""
  };
  refreshReservePlan();
  return getApplicationState();
}

/**
 * Return the current application state as a defensive copy.
 * @returns {object} Current state snapshot.
 */
export function getApplicationState() {
  return structuredClone(applicationState);
}

/**
 * Replace project inputs, validate them, and calculate only valid projects.
 * @param {object} project Current project input values.
 * @returns {object} Updated state snapshot.
 */
export function updateProject(project) {
  const validation = validateProject(project);
  applicationState = {
    ...applicationState,
    project: structuredClone(project),
    reconciliation: null,
    reserveMonthsRemaining: Number.isSafeInteger(project.grantDurationMonths)
      ? Math.max(
          1,
          Math.min(
            applicationState.reserveMonthsRemaining,
            project.grantDurationMonths
          )
        )
      : applicationState.reserveMonthsRemaining,
    validation,
    calculation: validation.valid
      ? calculateProject(validation.value, applicationState.rulesData, {
          asOfDate: applicationState.asOfDate,
          forceCautious: applicationState.limitedInformation
        })
      : null,
    selectedRoleId:
      Array.isArray(project.roles) &&
      project.roles.some((role) => role.id === applicationState.selectedRoleId)
        ? applicationState.selectedRoleId
        : project.roles[0]?.id || null,
    timelineMonth: Math.min(
      applicationState.timelineMonth,
      project.grantDurationMonths + 3
    )
  };
  refreshReservePlan();
  return getApplicationState();
}

/**
 * Update the dates and limited-information choice used for freshness estimates.
 * @param {object} options User-selected freshness options.
 * @returns {object} Updated state snapshot.
 */
export function setFreshnessOptions(options) {
  const asOfDate = getAsOfDate(options.asOfDate);
  const verifiedOnDate = options.verifiedOnDate
    ? getAsOfDate(options.verifiedOnDate)
    : "";
  const limitedInformation = Boolean(options.limitedInformation);
  const rulesData = applyVerificationDateOverride(
    applicationState.baseRulesData,
    verifiedOnDate
  );
  const validation = validateProject(applicationState.project);
  applicationState = {
    ...applicationState,
    rulesData,
    asOfDate,
    verifiedOnDate,
    limitedInformation,
    validation,
    calculation: validation.valid
      ? calculateProject(validation.value, rulesData, {
          asOfDate,
          forceCautious: limitedInformation
        })
      : null,
    notice: ""
  };
  refreshReservePlan();
  return getApplicationState();
}

/**
 * Replace the active rule pack without modifying the bundled fallback.
 * @param {object} rulesData Validated imported pack.
 * @returns {object} Updated state snapshot.
 */
export function setRulesPack(rulesData) {
  const activeRulesData = applyVerificationDateOverride(
    rulesData,
    applicationState.verifiedOnDate
  );
  const validation = validateProject(applicationState.project);
  applicationState = {
    ...applicationState,
    baseRulesData: rulesData,
    rulesData: activeRulesData,
    validation,
    calculation: validation.valid
      ? calculateProject(validation.value, activeRulesData, {
          asOfDate: applicationState.asOfDate,
          forceCautious: applicationState.limitedInformation
        })
      : null,
    notice: ""
  };
  refreshReservePlan();
  return getApplicationState();
}

/**
 * Update the months and existing reserve used by the Grant Cliff reserve planner.
 * @param {{monthsRemaining: number, startingReserve: number}} options Planner inputs.
 * @returns {object} Updated state snapshot.
 */
export function setReservePlanOptions(options) {
  const reserveMonthsRemaining = options.monthsRemaining;
  const reserveStartingAmount = options.startingReserve;
  const reservePlan = applicationState.calculation
    ? calculateReservePlan(
        applicationState.calculation.cliff,
        applicationState.calculation.uncertainty?.cliff ?? null,
        {
          monthsRemaining: reserveMonthsRemaining,
          startingReserve: reserveStartingAmount,
          asOfDate: applicationState.asOfDate
        }
      )
    : null;
  applicationState = {
    ...applicationState,
    reserveMonthsRemaining,
    reserveStartingAmount,
    reservePlan,
    notice: ""
  };
  return getApplicationState();
}

function refreshReservePlan() {
  const calculation = applicationState.calculation;
  applicationState.reservePlan = calculation
    ? calculateReservePlan(
        calculation.cliff,
        calculation.uncertainty?.cliff ?? null,
        {
          monthsRemaining: applicationState.reserveMonthsRemaining,
          startingReserve: applicationState.reserveStartingAmount,
          asOfDate: applicationState.asOfDate
        }
      )
    : null;
}

/**
 * Restore the original bundled rule pack.
 * @returns {object} Updated state snapshot.
 */
export function revertRulesPack() {
  return setRulesPack(applicationState.bundledRulesData);
}

/**
 * Store the result of comparing an earlier cautious estimate with a new pack.
 * @param {object|null} reconciliation Pack comparison summary.
 * @returns {object} Updated state snapshot.
 */
export function setReconciliation(reconciliation) {
  applicationState = { ...applicationState, reconciliation };
  return getApplicationState();
}

/**
 * Load a known-good project into the application state.
 * @param {object} project Valid project data.
 * @returns {object} Updated state snapshot.
 */
export function loadProject(project) {
  return updateProject(structuredClone(project));
}

/**
 * Save the current valid project as a named comparison scenario.
 * @param {string} name Scenario label.
 * @returns {object} Updated state snapshot.
 */
export function saveScenario(name) {
  const scenarioName = String(name).trim();
  if (!scenarioName) {
    throw new TypeError("Enter a name for this scenario.");
  }
  if (scenarioName.length > 80) {
    throw new TypeError("Scenario names must be 80 characters or fewer.");
  }
  if (applicationState.savedScenarios.length >= MAX_SAVED_SCENARIOS) {
    throw new RangeError("No more than three scenarios can be saved.");
  }
  if (!applicationState.validation.valid) {
    throw new TypeError("A valid project is required to save a scenario.");
  }
  applicationState = {
    ...applicationState,
    savedScenarios: [
      ...applicationState.savedScenarios,
      {
        id: `scenario-${nextScenarioId++}`,
        name: scenarioName,
        project: structuredClone(applicationState.validation.value)
      }
    ],
    notice: ""
  };
  return getApplicationState();
}

/**
 * Remove a saved project scenario by its stable in-session identifier.
 * @param {string} scenarioId Saved scenario identifier.
 * @returns {object} Updated state snapshot.
 */
export function removeScenario(scenarioId) {
  applicationState = {
    ...applicationState,
    savedScenarios: applicationState.savedScenarios.filter(
      (scenario) => scenario.id !== scenarioId
    ),
    notice: ""
  };
  return getApplicationState();
}

/**
 * Set the selected application language.
 * @param {string} language Supported locale code.
 * @returns {object} Updated state snapshot.
 */
export function setLanguage(language) {
  applicationState = { ...applicationState, language, notice: "" };
  return getApplicationState();
}

/**
 * Set the independent Funder Pack language.
 * @param {string} language Supported locale code.
 * @returns {object} Updated state snapshot.
 */
export function setFunderLanguage(language) {
  applicationState = {
    ...applicationState,
    funderLanguage: language,
    notice: ""
  };
  return getApplicationState();
}

/**
 * Switch between the main product views.
 * @param {string} activeView View identifier.
 * @returns {object} Updated state snapshot.
 */
export function setActiveView(activeView) {
  applicationState = { ...applicationState, activeView, notice: "" };
  return getApplicationState();
}

/**
 * Choose a worker role for the worker-facing explanation.
 * @param {string} selectedRoleId Existing role identifier.
 * @returns {object} Updated state snapshot.
 */
export function setSelectedRole(selectedRoleId) {
  applicationState = { ...applicationState, selectedRoleId };
  return getApplicationState();
}

/**
 * Choose a grant timeline month.
 * @param {number} timelineMonth One-based month in grant plus post-grant timeline.
 * @returns {object} Updated state snapshot.
 */
export function setTimelineMonth(timelineMonth) {
  applicationState = { ...applicationState, timelineMonth };
  return getApplicationState();
}

/**
 * Set a translated, user-visible status message.
 * @param {string} notice Translation key to announce.
 * @returns {object} Updated state snapshot.
 */
export function setNotice(notice) {
  applicationState = { ...applicationState, notice };
  return getApplicationState();
}
