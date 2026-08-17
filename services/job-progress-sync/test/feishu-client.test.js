import test from "node:test";
import assert from "node:assert/strict";

import {
  FeishuInterviewEventRepository,
  FeishuProgressRepository,
} from "../src/feishu-client.js";


test("finds all progress records by the enterprise record id field", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          code: 0,
          data: {
            items: [
              {
                record_id: "rec_progress",
                fields: {
                  "公司": "示例公司",
                  "企业清单 record_id": "rec_source",
                },
              },
            ],
          },
        };
      },
    };
  };
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl,
  });

  const result = await repository.findAllByEnterpriseRecordId("rec_source");

  assert.equal(result[0].record_id, "rec_progress");
  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/bitable/v1/apps/app_example/tables/tblExample/records/search?page_size=500",
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.Authorization, "Bearer tenant-token");
  assert.deepEqual(JSON.parse(requests[0].options.body).filter, {
    conjunction: "and",
    conditions: [
      {
        field_name: "企业清单 record_id",
        operator: "is",
        value: ["rec_source"],
      },
    ],
  });
});


test("returns an empty list when no matching progress record exists", async () => {
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { code: 0, data: { items: [] } };
      },
    }),
  });

  assert.deepEqual(await repository.findAllByEnterpriseRecordId("rec_missing"), []);
});

test("reads a progress record by its exact record id", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_progress", fields: {} } } };
        },
      };
    },
  });
  const result = await repository.findByRecordId("rec_progress");
  assert.equal(result.record_id, "rec_progress");
  assert.equal(requests[0].options.method, "GET");
  assert.match(requests[0].url, /\/records\/rec_progress$/);
});

test("paginates all interview events needed for reconciliation", async () => {
  const requests = [];
  const repository = new FeishuInterviewEventRepository({
    baseToken: "app_reminder",
    tableId: "tblAllEvents",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const secondPage = url.includes("page_token=next-page");
      return {
        ok: true,
        async json() {
          return {
            code: 0,
            data: secondPage
              ? { items: [{ record_id: "rec_two", fields: {} }], has_more: false }
              : {
                items: [{ record_id: "rec_one", fields: {} }],
                has_more: true,
                page_token: "next-page",
              },
          };
        },
      };
    },
  });

  const result = await repository.listAll();
  assert.deepEqual(result.map((item) => item.record_id), ["rec_one", "rec_two"]);
  assert.equal(requests.length, 2);
  assert.deepEqual(JSON.parse(requests[0].options.body).field_names, [
    "环节",
    "完成状态",
    "求职记录ID",
    "开始时间",
    "截止时间",
    "结束时间",
  ]);
});


test("returns multiple jobs for the same enterprise record id", async () => {
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          code: 0,
          data: {
            items: [
              { record_id: "rec_one", fields: {} },
              { record_id: "rec_two", fields: {} },
            ],
          },
        };
      },
    }),
  });

  assert.deepEqual(
    await repository.findAllByEnterpriseRecordId("rec_duplicate"),
    [
      { record_id: "rec_one", fields: {} },
      { record_id: "rec_two", fields: {} },
    ],
  );
});


test("creates a progress record with a stable client token and Feishu date value", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_progress" } } };
        },
      };
    },
  });
  const fields = {
    "当前阶段": "已投递",
    "公司": "示例公司",
    "投递岗位": "",
    "投递日期": "2026-07-17",
    "岗位 JD": "",
    "公告链接": "https://example.com/notice",
    "投递链接": "https://example.com/apply",
    "企业清单 record_id": "rec_source",
  };

  const first = await repository.create(fields);
  await repository.create(fields);

  assert.equal(first, "rec_progress");
  const firstUrl = new URL(requests[0].url);
  const secondUrl = new URL(requests[1].url);
  assert.equal(firstUrl.pathname, "/open-apis/bitable/v1/apps/app_example/tables/tblExample/records");
  assert.match(
    firstUrl.searchParams.get("client_token"),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(
    firstUrl.searchParams.get("client_token"),
    secondUrl.searchParams.get("client_token"),
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    fields: {
      ...fields,
      "投递日期": Date.parse("2026-07-17T00:00:00+08:00"),
    },
  });
});


test("updates an existing progress record without changing blank non-date fields", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: { record: { record_id: "rec_progress" } } };
        },
      };
    },
  });

  await repository.update("rec_progress", {
    "投递岗位": "",
    "投递日期": "2026-07-18",
  });

  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/bitable/v1/apps/app_example/tables/tblExample/records/rec_progress",
  );
  assert.equal(requests[0].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    fields: {
      "投递岗位": "",
      "投递日期": Date.parse("2026-07-18T00:00:00+08:00"),
    },
  });
});


test("deletes an existing progress record by its exact record id", async () => {
  const requests = [];
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return { code: 0, data: {} };
        },
      };
    },
  });

  await repository.delete("rec_progress");

  assert.equal(
    requests[0].url,
    "https://open.feishu.cn/open-apis/bitable/v1/apps/app_example/tables/tblExample/records/rec_progress",
  );
  assert.equal(requests[0].options.method, "DELETE");
});


test("retries transient Feishu failures before returning a record", async () => {
  let attempts = 0;
  const repository = new FeishuProgressRepository({
    baseToken: "app_example",
    tableId: "tblExample",
    accessTokenProvider: async () => "tenant-token",
    retryOptions: { attempts: 3, delayMs: 0 },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("temporary network failure");
      }
      return {
        ok: true,
        async json() {
          return { code: 0, data: { items: [] } };
        },
      };
    },
  });

  assert.deepEqual(await repository.findAllByEnterpriseRecordId("rec_source"), []);
  assert.equal(attempts, 3);
});
