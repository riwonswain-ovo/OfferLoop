import { timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";


function secretsMatch(actual, expected) {
  const left = Buffer.from(String(actual ?? ""));
  const right = Buffer.from(String(expected ?? ""));
  return left.length === right.length && timingSafeEqual(left, right);
}


function getHeader(headers, name) {
  const target = name.toLowerCase();
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === target,
  );
  return entry?.[1];
}


export async function handleSyncRequest(request, deps) {
  const actualSecret = getHeader(request.headers, "x-offerloop-secret");
  if (!secretsMatch(actualSecret, deps.webhookSecret)) {
    return {
      status: 401,
      body: { ok: false, error: "unauthorized" },
    };
  }

  if (!request.body?.source_record_id) {
    return {
      status: 400,
      body: { ok: false, error: "source_record_id is required" },
    };
  }

  const payload = request.body;
  if (payload.event !== "application.submitted") {
    return {
      status: 400,
      body: { ok: false, error: "event must be application.submitted" },
    };
  }
  if (
    !String(payload.company ?? "").trim()
    || Number.isNaN(Date.parse(payload.transitioned_at))
  ) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "company and transitioned_at are required",
      },
    };
  }
  const existing = await deps.repository.findByEnterpriseRecordId(
    payload.source_record_id,
  );
  if (existing === null) {
    const fields = {
      "当前阶段": "已投递",
      "公司": payload.company,
      "投递岗位": "",
      "投递日期": String(payload.transitioned_at).slice(0, 10),
      "岗位 JD": "",
      "公告链接": payload.announcement_url ?? "",
      "投递链接": payload.application_url ?? "",
      "企业清单 record_id": payload.source_record_id,
    };
    const recordId = await deps.repository.create(fields);
    return {
      status: 200,
      body: { ok: true, action: "created", record_id: recordId },
    };
  }

  const fields = {
    ...existing.fields,
    "当前阶段": existing.fields["当前阶段"] || "已投递",
    "公司": payload.company,
    "投递岗位": existing.fields["投递岗位"] ?? "",
    "投递日期":
      existing.fields["投递日期"] || String(payload.transitioned_at).slice(0, 10),
    "岗位 JD": existing.fields["岗位 JD"] ?? "",
    "公告链接": payload.announcement_url ?? "",
    "投递链接": payload.application_url ?? "",
    "企业清单 record_id": payload.source_record_id,
  };
  delete fields["原招聘信息"];
  if (isDeepStrictEqual(fields, existing.fields)) {
    return {
      status: 200,
      body: { ok: true, action: "unchanged", record_id: existing.record_id },
    };
  }
  await deps.repository.update(existing.record_id, fields);
  return {
    status: 200,
    body: { ok: true, action: "updated", record_id: existing.record_id },
  };

}
