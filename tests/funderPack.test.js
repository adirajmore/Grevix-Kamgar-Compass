import assert from "node:assert/strict";
import test from "node:test";
import { generateFunderPack } from "../src/funderPack.js";
import { calculateProject } from "../src/engine.js";
import { makeSampleProject, rulesData } from "./fixtures.js";

test("Funder Pack includes cost lines, grant, law sources, and verification caveat", () => {
  const project = makeSampleProject();
  const calculation = calculateProject(project, rulesData);
  const note = generateFunderPack(
    project,
    rulesData,
    calculation,
    (key) =>
      ({
        "dashboard.grantAmount": "Total grant amount",
        "notice.disclaimer": "not a legal determination"
      })[key] || key,
    (amount) => `₹${amount}`
  );
  assert.match(note, /Total grant amount/);
  assert.match(note, /illustrative employer costs/);
  assert.match(
    note,
    /Employees' Provident Funds and Miscellaneous Provisions Act/
  );
  assert.match(note, /TO VERIFY/);
  assert.match(note, /not a legal determination/);
});
