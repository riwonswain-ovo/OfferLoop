import { isDeepStrictEqual } from "node:util";

import {
  parseProgressRecordIds,
  projectProgressFromEvents,
} from "./progress-model.js";

function projection(fields) {
  return {
    "进展状态": fields["进展状态"],
    "最近完成节点": fields["最近完成节点"],
  };
}


export async function reconcileInterviewEvents({
  eventRepository,
  progressRepository,
  recordId,
}) {
  if (!String(recordId ?? "").trim()) {
    throw new Error("recordId is required; full reconciliation is disabled");
  }
  const changedEvent = await eventRepository.findByRecordId(recordId);
  if (!changedEvent) {
    return { action: "missing", record_id: recordId, matched_count: 0, updated_count: 0, missing_count: 1 };
  }
  const selectedProgressIds = new Set();
  for (const progressId of parseProgressRecordIds(changedEvent.fields?.["求职记录ID"])) {
    selectedProgressIds.add(progressId);
  }

  if (selectedProgressIds.size === 0) {
    return {
      action: "unlinked",
      record_id: recordId,
      matched_count: 0,
      updated_count: 0,
      missing_count: 0,
    };
  }

  const targetIds = [...selectedProgressIds];
  const updatedRecordIds = [];
  const missingRecordIds = [];
  const failedRecordIds = [];
  for (const progressId of targetIds) {
    try {
      const linkedEvents = await eventRepository.listByProgressRecordId(progressId);
      const record = await progressRepository.findByRecordId(progressId);
      if (!record) {
        missingRecordIds.push(progressId);
        continue;
      }
      const next = projectProgressFromEvents(
        record.fields,
        linkedEvents,
      );
      const currentProjection = projection(record.fields);
      const nextProjection = projection(next);
      if (!isDeepStrictEqual(currentProjection, nextProjection)) {
        await progressRepository.update(progressId, nextProjection);
        updatedRecordIds.push(progressId);
      }
    } catch {
      failedRecordIds.push(progressId);
    }
  }

  return {
    action: failedRecordIds.length > 0
      ? updatedRecordIds.length > 0 ? "partial_failure" : "failed"
      : updatedRecordIds.length > 0 ? "updated" : "unchanged",
    record_id: recordId,
    matched_count: targetIds.length,
    updated_count: updatedRecordIds.length,
    missing_count: missingRecordIds.length,
    failed_count: failedRecordIds.length,
    updated_record_ids: updatedRecordIds,
    missing_record_ids: missingRecordIds,
    failed_record_ids: failedRecordIds,
  };
}
