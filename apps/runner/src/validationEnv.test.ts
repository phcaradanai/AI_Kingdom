import assert from "node:assert/strict";
import test from "node:test";
import {
  VALIDATION_ENV_MISSING_MESSAGE,
  buildValidationChildEnv,
  formatForwardedValidationEnvNames,
  getValidationEnvAllowlist,
  validateValidationDatabaseEnv
} from "./validationEnv.js";

test("validation env allowlist defaults to test database, database, and NODE_ENV", () => {
  assert.deepEqual(getValidationEnvAllowlist({}), ["TEST_DATABASE_URL", "DATABASE_URL", "NODE_ENV"]);
});

test("validation child env forwards TEST_DATABASE_URL and blocks runner secrets", () => {
  const child = buildValidationChildEnv({
    TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
    DATABASE_URL: "postgresql://user:pass@localhost:5432/dev",
    NODE_ENV: "test",
    RUNNER_TOKEN: "plain-runner-token",
    OPENAI_API_KEY: "sk-secret",
    PATH: "/usr/bin"
  });

  assert.equal(child.env.TEST_DATABASE_URL, "postgresql://user:pass@localhost:5432/test");
  assert.equal(child.env.DATABASE_URL, "postgresql://user:pass@localhost:5432/dev");
  assert.equal(child.env.NODE_ENV, "test");
  assert.equal(child.env.RUNNER_TOKEN, undefined);
  assert.equal(child.env.OPENAI_API_KEY, undefined);
  assert.deepEqual(child.forwardedNames, ["TEST_DATABASE_URL", "DATABASE_URL", "NODE_ENV"]);
});

test("validation database env passes with DATABASE_URL when TEST_DATABASE_URL is missing", () => {
  assert.deepEqual(validateValidationDatabaseEnv({
    DATABASE_URL: "postgresql://user:pass@localhost:5432/dev"
  }), { ok: true });
});

test("validation database env fails clearly when both database envs are missing", () => {
  assert.deepEqual(validateValidationDatabaseEnv({}), {
    ok: false,
    message: VALIDATION_ENV_MISSING_MESSAGE
  });
});

test("forwarded validation env log shows names but not values", () => {
  const message = formatForwardedValidationEnvNames({
    TEST_DATABASE_URL: "postgresql://user:pass@localhost:5432/test",
    NODE_ENV: "test"
  });

  assert.equal(message, "Forwarded validation env: TEST_DATABASE_URL, NODE_ENV");
  assert.doesNotMatch(message, /user:pass/);
});
