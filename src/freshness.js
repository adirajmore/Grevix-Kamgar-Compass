const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function parseIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function verificationDateForRule(rule) {
  const dates = [rule?.last_verified];
  let hasUnverifiedInput = false;
  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    if (
      Object.hasOwn(value, "value") &&
      Object.hasOwn(value, "last_verified")
    ) {
      dates.push(value.last_verified);
    }
    for (const child of Object.values(value)) {
      visit(child);
    }
  }
  visit(rule?.applies_if);
  visit(rule?.calculation);
  for (const date of dates) {
    const parsed = parseIsoDate(date);
    if (!parsed) {
      hasUnverifiedInput = true;
    }
  }
  if (hasUnverifiedInput) {
    return null;
  }
  return dates.sort()[0];
}

/**
 * Resolve a valid ISO as-of date, defaulting to the current UTC calendar date.
 * @param {string|Date|undefined} value Optional manual date override.
 * @returns {string} Calendar date in ISO YYYY-MM-DD format.
 */
export function getAsOfDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (value === undefined) {
    return new Date().toISOString().slice(0, 10);
  }
  if (!parseIsoDate(value)) {
    throw new TypeError("As-of date must be a valid ISO calendar date.");
  }
  return value;
}

/**
 * Calculate whole UTC calendar days since a rule was last verified.
 * @param {object} rule Rule metadata.
 * @param {string|Date} asOfDate Date to measure against.
 * @returns {number|null} Age in days, or null when the verification date is missing.
 */
export function getRuleAgeDays(rule, asOfDate) {
  const verified = parseIsoDate(verificationDateForRule(rule));
  const asOf = parseIsoDate(getAsOfDate(asOfDate));
  if (!verified || !asOf) {
    return null;
  }
  return Math.max(0, Math.floor((asOf - verified) / DAY_MILLISECONDS));
}

/**
 * Classify a rule using volatility-specific day thresholds.
 * @param {object} rule Rule metadata.
 * @param {string|Date} asOfDate Date to measure against.
 * @param {object} thresholds Freshness thresholds by volatility.
 * @returns {"fresh"|"aging"|"stale"|"expired"|"unverified"} Rule freshness.
 */
export function classifyFreshness(rule, asOfDate, thresholds) {
  const ageDays = getRuleAgeDays(rule, asOfDate);
  const bands = thresholds?.[rule?.volatility];
  if (ageDays === null || !bands) {
    return "unverified";
  }
  if (ageDays >= bands.expiredDays) {
    return "expired";
  }
  if (ageDays >= bands.staleDays) {
    return "stale";
  }
  if (ageDays >= bands.agingDays) {
    return "aging";
  }
  return "fresh";
}

/**
 * Summarize freshness for a complete rule set.
 * @param {object[]} rules Rule metadata records.
 * @param {string|Date} asOfDate Date to measure against.
 * @param {object} thresholds Freshness thresholds by volatility.
 * @returns {object} Counts and rules needing verification.
 */
export function summarisePackFreshness(rules, asOfDate, thresholds) {
  const counts = {
    fresh: 0,
    aging: 0,
    stale: 0,
    expired: 0,
    unverified: 0
  };
  const details = rules.map((rule) => {
    const freshness = classifyFreshness(rule, asOfDate, thresholds);
    const ageDays = getRuleAgeDays(rule, asOfDate);
    counts[freshness] += 1;
    return { id: rule.id, area: rule.area, freshness, ageDays };
  });
  return {
    asOfDate: getAsOfDate(asOfDate),
    counts,
    rules: details,
    needsReview: details.filter((item) => item.freshness !== "fresh")
  };
}

/**
 * Apply a user-supplied pack verification date without mutating rule data.
 * @param {object} rulesData Rule pack data.
 * @param {string|undefined} verifiedOnOverride User verification date override.
 * @returns {object} A shallow copy with effective rule verification dates.
 */
export function applyVerificationDateOverride(rulesData, verifiedOnOverride) {
  if (!verifiedOnOverride) {
    return rulesData;
  }
  const verifiedDate = getAsOfDate(verifiedOnOverride);
  function updateDates(value) {
    if (Array.isArray(value)) {
      return value.map(updateDates);
    }
    if (!value || typeof value !== "object") {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === "last_verified" ? verifiedDate : updateDates(child)
      ])
    );
  }
  const updated = updateDates(rulesData);
  return {
    ...updated,
    rules: updated.rules.map((rule) => ({
      ...rule,
      last_verified: verifiedDate
    }))
  };
}
