import test from "node:test";
import assert from "node:assert/strict";

import { createSyncService } from "../src/runtime.js";


const ENV = {
  FEISHU_APP_ID: "cli_example",
  FEISHU_APP_SECRET: "secret-example",
  PROGRESS_BASE_TOKEN: "app_example",
  PROGRESS_TABLE_ID: "tblExample",
  WEBHOOK_SECRET: "webhook-example",
};

const INTERVIEW_ENV = {
  ...ENV,
  REMINDER_BASE_TOKEN: "app_reminder",
  REMINDER_TABLE_ID: "tblAllEvents",
};


test("requires every deployment setting without logging its value", () => {
  assert.throws(
    () => createSyncService({ env: { ...ENV, WEBHOOK_SECRET: "" } }),
    /missing required environment variable: WEBHOOK_SECRET/i,
  );
});


test("exchanges app credentials for a token and handles a webhook end to end", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
      return {
        ok: true,
        async json() {
          return { code: 0, tenant_access_token: "tenant-token", expire: 7200 };
        },
      };
    }
    if (url.includes("/records/search")) {
      return {
        ok: true,
        async json() {
          return { code: 0, data: { items: [] } };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { code: 0, data: { record: { record_id: "rec_progress" } } };
      },
    };
  };
  const service = createSyncService({
    env: ENV,
    fetchImpl,
    retryOptions: { attempts: 1, delayMs: 0 },
  });

  const response = await service({
    headers: { "x-offerloop-secret": "webhook-example" },
    body: JSON.stringify({
      event: "application.submitted",
      source_record_id: "rec_source",
      company: "示例公司",
      announcement_url: "https://example.com/notice",
      application_url: "https://example.com/apply",
      transitioned_at: "2026-07-17T19:00:00+08:00",
    }),
  });

  assert.deepEqual(response, {
    status: 200,
    body: { ok: true, action: "created", record_id: "rec_progress" },
  });
  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    app_id: ENV.FEISHU_APP_ID,
    app_secret: ENV.FEISHU_APP_SECRET,
  });
  assert.equal(requests[1].options.headers.Authorization, "Bearer tenant-token");
  assert.equal(requests[2].options.headers.Authorization, "Bearer tenant-token");
});


test("reuses a valid tenant token across webhook requests", async () => {
  let tokenRequests = 0;
  const fetchImpl = async (url) => {
    if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
      tokenRequests += 1;
      return {
        ok: true,
        async json() {
          return { code: 0, tenant_access_token: "tenant-token", expire: 7200 };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { code: 0, data: { items: [] } };
      },
    };
  };
  const service = createSyncService({
    env: ENV,
    fetchImpl,
    retryOptions: { attempts: 1, delayMs: 0 },
  });
  const request = {
    headers: { "x-offerloop-secret": "webhook-example" },
    body: {
      event: "application.submitted",
      source_record_id: "rec_source",
      company: "示例公司",
      announcement_url: "https://example.com/notice",
      application_url: "https://example.com/apply",
      transitioned_at: "2026-07-17T19:00:00+08:00",
    },
  };

  // The mocked lookup returns no items; replace create to avoid coupling this
  // token-cache assertion to the response shape of another endpoint.
  await assert.rejects(service(request));
  await assert.rejects(service(request));

  assert.equal(tokenRequests, 1);
});

test("reconciles a manually completed interview-center event end to end", async () => {
  const updates = [];
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/auth/v3/tenant_access_token/internal")) {
      return {
        ok: true,
        async json() {
          return { code: 0, tenant_access_token: "tenant-token", expire: 7200 };
        },
      };
    }
    if (url.endsWith("/records/rec_jd_exam") && options.method === "GET") {
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_jd_exam", fields: { "环节": "笔试", "完成状态": "已完成", "事件状态": "有效", "求职记录ID": '["rec_jd_progress"]' } } } };
        },
      };
    }
    if (url.includes("app_reminder") && url.includes("/records/search")) {
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: {
              items: [{
                record_id: "rec_jd_exam",
                created_time: "100",
                fields: {
                  "环节": "笔试",
                  "完成状态": "已完成",
                  "求职记录ID": '["rec_jd_progress"]',
                },
              }],
            },
          };
        },
      };
    }
    if (url.endsWith("/records/rec_jd_progress") && options.method === "GET") {
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: {
              record: {
                record_id: "rec_jd_progress",
                fields: {
                  "进展状态": "待笔试",
                  "最近完成节点": "投递完成",
                },
              },
            },
          };
        },
      };
    }
    if (url.endsWith("/records/rec_jd_progress") && options.method === "PUT") {
      updates.push(JSON.parse(options.body).fields);
      return {
        ok: true,
        async json() { return { code: 0, data: {} }; },
      };
    }
    throw new Error(`unexpected request: ${options.method} ${url}`);
  };
  const service = createSyncService({
    env: INTERVIEW_ENV,
    fetchImpl,
    retryOptions: { attempts: 1, delayMs: 0 },
  });
  const response = await service({
    headers: { "x-offerloop-secret": "webhook-example" },
    body: {
      event: "interview.reconcile",
      record_id: "rec_jd_exam",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.updated_count, 1);
  assert.deepEqual(updates, [{
    "进展状态": "待反馈",
    "最近完成节点": "笔试完成",
  }]);
});
