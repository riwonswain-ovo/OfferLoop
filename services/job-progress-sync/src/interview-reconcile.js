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
  recordId = "",
}) {
  const events = await eventRepository.listAll();
  const selectedProgressIds = new Set();
  const eventsByProgressId = new Map();

  for (const event of events) {
    const progressIds = parseProgressRecordIds(event.fields?.["求职记录ID"]);
    if (
      !recordId
      || event.record_id === recordId
    ) {
      for (const progressId of progressIds) selectedProgressIds.add(progressId);
    }
    for (const progressId of progressIds) {
      const linked = eventsByProgressId.get(progressId) ?? [];
      linked.push(event);
      eventsByProgressId.set(progressId, linked);
    }
  }

  if (recordId && selectedProgressIds.size === 0) {
    return {
      action: "unlinked",
      record_id: recordId,
      matched_count: 0,
      updated_count: 0,
      missing_count: 0,
    };
  }

  const targetIds = recordId
    ? [...selectedProgressIds]
    : [...eventsByProgressId.keys()];
  const updatedRecordIds = [];
  const missingRecordIds = [];
  const failedRecordIds = [];
  for (const progressId of targetIds) {
    try {
      const record = await progressRepository.findByRecordId(progressId);
      if (!record) {
        missingRecordIds.push(progressId);
        continue;
      }
      const next = projectProgressFromEvents(
        record.fields,
        eventsByProgressId.get(progressId) ?? [],
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
    record_id: recordId || null,
    matched_count: targetIds.length,
    updated_count: updatedRecordIds.length,
    missing_count: missingRecordIds.length,
    failed_count: failedRecordIds.length,
    updated_record_ids: updatedRecordIds,
    missing_record_ids: missingRecordIds,
    failed_record_ids: failedRecordIds,
  };
}
