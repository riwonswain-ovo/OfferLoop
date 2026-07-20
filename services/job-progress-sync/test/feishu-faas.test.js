import test from "node:test";
import assert from "node:assert/strict";

import { adaptFaasEvent } from "../src/feishu-faas.js";


test("adapts a FaaS HTTP event and serializes the core handler response", async () => {
  const seen = [];
  const service = async (request) => {
    seen.push(request);
    return {
      status: 200,
      body: { ok: true, action: "unchanged", record_id: "rec_progress" },
    };
  };

  const response = await adaptFaasEvent(
    {
      headers: { "X-OfferLoop-Secret": "placeholder" },
      body: "{\"event\":\"application.submitted\"}",
    },
    { service },
  );

  assert.deepEqual(seen, [
    {
      headers: { "X-OfferLoop-Secret": "placeholder" },
      body: "{\"event\":\"application.submitted\"}",
    },
  ]);
  assert.deepEqual(response, {
    statusCode: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      ok: true,
      action: "unchanged",
      record_id: "rec_progress",
    }),
  });
});
