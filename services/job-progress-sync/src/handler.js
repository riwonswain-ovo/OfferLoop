import { timingSafeEqual } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { normalizeProgressFields } from "./progress-model.js";


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


function readText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(readText).filter(Boolean).join("");
  }
  if (value && typeof value === "object") {
    return readText(value.text ?? value.name ?? value.value ?? "");
  }
  return "";
}


function canDeleteGeneratedDefault(record, sourceRecordId) {
  const fields = record.fields ?? {};
  const expectedApplicationId = `enterprise:${sourceRecordId}:default`;
  const progressStatus = readText(fields["进展状态"]);
  const completed = readText(fields["最近完成节点"]);
  const stage = readText(fields["当前阶段"]);
  const next = readText(fields["下一环节"]);
  const result = readText(fields["流程结果"]);
  return (
    readText(fields["投递记录 ID"]) === expectedApplicationId
    && !readText(fields["投递岗位"])
    && !readText(fields["岗位 JD"])
    && (!progressStatus || progressStatus === "待反馈")
    && (!completed || completed === "投递完成")
    && (!stage || stage === "已投递")
    && (!next || next === "待反馈")
    && (!result || result === "进行中")
  );
}


async function reconcileUnsubmitted(payload, repository) {
  const existingRecords = await repository.findAllByEnterpriseRecordId(
    payload.source_record_id,
  );
  const deletable = existingRecords.filter((record) => (
    canDeleteGeneratedDefault(record, payload.source_record_id)
  ));
  const protectedRecords = existingRecords.filter((record) => (
    !canDeleteGeneratedDefault(record, payload.source_record_id)
  ));
  for (const record of deletable) {
    await repository.delete(record.record_id);
  }
  return {
    status: 200,
    body: {
      ok: true,
      action: protectedRecords.length > 0
        ? "review_required"
        : deletable.length > 0 ? "deleted" : "unchanged",
      record_id: existingRecords[0]?.record_id ?? null,
      matched_count: existingRecords.length,
      deleted_count: deletable.length,
      protected_count: protectedRecords.length,
    },
  };
}


export async function handleSyncRequest(request, deps) {
  const actualSecret = getHeader(request.headers, "x-offerloop-secret");
  if (!secretsMatch(actualSecret, deps.webhookSecret)) {
    return {
      status: 401,
      body: { ok: false, error: "unauthorized" },
    };
  }

  const payload = request.body;
  if (payload?.event === "interview.reconcile") {
    if (!deps.interviewReconciler) {
      return {
        status: 503,
        body: { ok: false, error: "interview reconciliation is not configured" },
      };
    }
    const result = await deps.interviewReconciler({
      recordId: readText(payload.record_id),
    });
    return { status: 200, body: { ok: true, ...result } };
  }

  if (!payload?.source_record_id) {
    return {
      status: 400,
      body: { ok: false, error: "source_record_id is required" },
    };
  }

  const isSubmittedEvent = payload.event === "application.submitted";
  const isStatusChangeEvent = payload.event === "application.status_changed";
  if (!isSubmittedEvent && !isStatusChangeEvent) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "event must be application.submitted or application.status_changed",
      },
    };
  }
  const status = isSubmittedEvent ? "已投递" : readText(payload.status);
  if (isStatusChangeEvent && !status) {
    return {
      status: 400,
      body: { ok: false, error: "status is required for application.status_changed" },
    };
  }
  if (status !== "已投递") {
    return reconcileUnsubmitted(payload, deps.repository);
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
  const existingRecords = await deps.repository.findAllByEnterpriseRecordId(
    payload.source_record_id,
  );
  if (existingRecords.length === 0) {
    const fields = {
      "进展状态": "待反馈",
      "最近完成节点": "投递完成",
      "下一环节": "待反馈",
      "流程结果": "进行中",
      "当前阶段": "已投递",
      "公司": payload.company,
      "投递岗位": "",
      "投递日期": String(payload.transitioned_at).slice(0, 10),
      "岗位 JD": "",
      "公告链接": payload.announcement_url ?? "",
      "投递链接": payload.application_url ?? "",
      "企业清单 record_id": payload.source_record_id,
      "投递记录 ID": `enterprise:${payload.source_record_id}:default`,
    };
    const recordId = await deps.repository.create(fields);
    return {
      status: 200,
      body: { ok: true, action: "created", record_id: recordId },
    };
  }

  const updatedRecordIds = [];
  for (const existing of existingRecords) {
    const fields = {
      ...normalizeProgressFields(existing.fields),
      "公司": payload.company,
      "投递岗位": existing.fields["投递岗位"] ?? "",
      "投递日期":
        existing.fields["投递日期"] || String(payload.transitioned_at).slice(0, 10),
      "岗位 JD": existing.fields["岗位 JD"] ?? "",
      "公告链接": payload.announcement_url ?? "",
      "投递链接": payload.application_url ?? "",
      "企业清单 record_id": payload.source_record_id,
      "投递记录 ID":
        existing.fields["投递记录 ID"] || `progress:${existing.record_id}`,
    };
    delete fields["原招聘信息"];
    if (!isDeepStrictEqual(fields, existing.fields)) {
      await deps.repository.update(existing.record_id, fields);
      updatedRecordIds.push(existing.record_id);
    }
  }
  return {
    status: 200,
    body: {
      ok: true,
      action: updatedRecordIds.length > 0 ? "updated" : "unchanged",
      record_id: existingRecords[0].record_id,
      matched_count: existingRecords.length,
    },
  };

}
