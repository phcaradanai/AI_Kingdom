import assert from "node:assert/strict";
import test from "node:test";
import { decideImportedPatchStatus } from "./importedPatchStatus.js";

test("returns CHECK_FAILED when patch did not apply", () => {
  assert.equal(
    decideImportedPatchStatus({ applied: false, emptyPatch: false, allValidationPassed: true }),
    "CHECK_FAILED"
  );
  assert.equal(
    decideImportedPatchStatus({ applied: false, emptyPatch: true, allValidationPassed: false }),
    "CHECK_FAILED"
  );
});

test("returns NO_CHANGES when patch applied but diff is empty", () => {
  assert.equal(
    decideImportedPatchStatus({ applied: true, emptyPatch: true, allValidationPassed: true }),
    "NO_CHANGES"
  );
  assert.equal(
    decideImportedPatchStatus({ applied: true, emptyPatch: true, allValidationPassed: false }),
    "NO_CHANGES"
  );
});

test("returns VALIDATED when patch applied and all validation commands passed", () => {
  assert.equal(
    decideImportedPatchStatus({ applied: true, emptyPatch: false, allValidationPassed: true }),
    "VALIDATED"
  );
});

test("returns VALIDATION_FAILED when patch applied but any validation command failed", () => {
  assert.equal(
    decideImportedPatchStatus({ applied: true, emptyPatch: false, allValidationPassed: false }),
    "VALIDATION_FAILED"
  );
});
