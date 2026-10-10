import { SUPPORTED_LANGUAGES } from "./constants.js";
import { calculateProject } from "./engine.js";
import { validateProject } from "./validation.js";

let applicationState = null;

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
  browserLanguages
) {
  const browserLanguage = browserLanguages
    .map((language) => language.toLowerCase().split("-")[0])
    .find((language) => SUPPORTED_LANGUAGES.includes(language));
  const language = SUPPORTED_LANGUAGES.includes(storedLanguage)
    ? storedLanguage
    : browserLanguage || "en";
  applicationState = {
    project: structuredClone(sampleProject),
    rulesData,
    language,
    funderLanguage: "en",
    activeView: "ngo",
    selectedRoleId: sampleProject.roles[0]?.id || null,
    timelineMonth: sampleProject.grantDurationMonths,
    validation: validateProject(sampleProject),
    calculation: calculateProject(sampleProject, rulesData),
    notice: ""
  };
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
    validation,
    calculation: validation.valid
      ? calculateProject(validation.value, applicationState.rulesData)
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
