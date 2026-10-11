import assert from "node:assert/strict";
import test from "node:test";
import { RULE_FRESHNESS_THRESHOLDS } from "../src/constants.js";
import {
  applyVerificationDateOverride,
  classifyFreshness,
  getAsOfDate,
  getRuleAgeDays,
  summarisePackFreshness
} from "../src/freshness.js";

const asOfDate = "2026-10-11";

function verifiedRule(volatility, lastVerified) {
  return {
    id: volatility,
    area: volatility,
    volatility,
    last_verified: lastVerified
  };
}

test("freshness boundaries classify all volatility levels", () => {
  for (const [volatility, thresholds] of Object.entries(
    RULE_FRESHNESS_THRESHOLDS
  )) {
    const withinFresh = new Date(
      Date.parse(asOfDate) - (thresholds.agingDays - 1) * 86400000
    )
      .toISOString()
      .slice(0, 10);
    const aging = new Date(
      Date.parse(asOfDate) - thresholds.agingDays * 86400000
    )
      .toISOString()
      .slice(0, 10);
    const stale = new Date(
      Date.parse(asOfDate) - thresholds.staleDays * 86400000
    )
      .toISOString()
      .slice(0, 10);
    const expired = new Date(
      Date.parse(asOfDate) - thresholds.expiredDays * 86400000
    )
      .toISOString()
      .slice(0, 10);

    assert.equal(
      classifyFreshness(
        verifiedRule(volatility, withinFresh),
        asOfDate,
        RULE_FRESHNESS_THRESHOLDS
      ),
      "fresh"
    );
    assert.equal(
      classifyFreshness(
        verifiedRule(volatility, aging),
        asOfDate,
        RULE_FRESHNESS_THRESHOLDS
      ),
      "aging"
    );
    assert.equal(
      classifyFreshness(
        verifiedRule(volatility, stale),
        asOfDate,
        RULE_FRESHNESS_THRESHOLDS
      ),
      "stale"
    );
    assert.equal(
      classifyFreshness(
        verifiedRule(volatility, expired),
        asOfDate,
        RULE_FRESHNESS_THRESHOLDS
      ),
      "expired"
    );
  }
});

test("unverified and legacy rule dates remain explicitly unverified", () => {
  assert.equal(
    getRuleAgeDays(verifiedRule("high", "TO VERIFY"), asOfDate),
    null
  );
  assert.equal(
    classifyFreshness(
      verifiedRule("high", "TO VERIFY"),
      asOfDate,
      RULE_FRESHNESS_THRESHOLDS
    ),
    "unverified"
  );
  assert.equal(
    classifyFreshness({ last_verified: "2025-01-01" }, asOfDate, {}),
    "unverified"
  );
  const unverifiedInput = {
    ...verifiedRule("medium", "2026-10-10"),
    applies_if: {
      minimum_headcount: { value: 10, last_verified: "TO VERIFY" }
    }
  };
  assert.equal(
    classifyFreshness(unverifiedInput, asOfDate, RULE_FRESHNESS_THRESHOLDS),
    "unverified"
  );
  assert.throws(() => getAsOfDate("2026-02-30"), TypeError);
});

test("pack summary counts fresh, stale and unverified rules", () => {
  const rules = [
    verifiedRule("low", "2026-01-01"),
    verifiedRule("high", "2026-04-01"),
    verifiedRule("medium", "TO VERIFY")
  ];
  const summary = summarisePackFreshness(
    rules,
    asOfDate,
    RULE_FRESHNESS_THRESHOLDS
  );
  assert.equal(summary.counts.fresh, 1);
  assert.equal(summary.counts.stale, 1);
  assert.equal(summary.counts.unverified, 1);
  assert.deepEqual(
    summary.needsReview.map((rule) => rule.freshness),
    ["stale", "unverified"]
  );
});

test("manual verification date overrides pack rule dates immutably", () => {
  const rulesData = {
    rules: [
      {
        ...verifiedRule("medium", "TO VERIFY"),
        calculation: {
          rate_basis_points: { value: 325, last_verified: "TO VERIFY" }
        }
      }
    ]
  };
  const updated = applyVerificationDateOverride(rulesData, "2026-10-01");
  assert.equal(rulesData.rules[0].last_verified, "TO VERIFY");
  assert.equal(updated.rules[0].last_verified, "2026-10-01");
  assert.equal(
    updated.rules[0].calculation.rate_basis_points.last_verified,
    "2026-10-01"
  );
});
