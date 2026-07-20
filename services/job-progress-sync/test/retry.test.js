import test from "node:test";
import assert from "node:assert/strict";

import { retryOperation } from "../src/retry.js";


test("retries a transient operation at most three times", async () => {
  let attempts = 0;
  const result = await retryOperation(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary failure");
      }
      return "ok";
    },
    { attempts: 3, delayMs: 0 },
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});


test("surfaces the final error after the retry budget is exhausted", async () => {
  let attempts = 0;

  await assert.rejects(
    retryOperation(
      async () => {
        attempts += 1;
        throw new Error("still failing");
      },
      { attempts: 3, delayMs: 0 },
    ),
    /still failing/,
  );
  assert.equal(attempts, 3);
});
