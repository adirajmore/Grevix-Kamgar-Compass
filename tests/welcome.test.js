import assert from "node:assert/strict";
import test from "node:test";
import {
  hasDismissedWelcome,
  rememberWelcomeDismissal
} from "../src/welcome.js";

function createSessionStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}

test("welcome dismissal is remembered only when stored for the session", () => {
  const storage = createSessionStorage();
  assert.equal(hasDismissedWelcome(storage), false);

  rememberWelcomeDismissal(storage);
  assert.equal(hasDismissedWelcome(storage), true);
});
