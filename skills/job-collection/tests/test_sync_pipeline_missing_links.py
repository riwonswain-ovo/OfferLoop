import unittest

from scripts.sync_pipeline import (
    PERSISTED_CANDIDATE_FIELDS,
    PendingBatchState,
    PendingCandidate,
    PendingSourceCheckpoint,
)


def snapshot(**overrides):
    values = {key: "" for key in PERSISTED_CANDIDATE_FIELDS}
    values.update(
        {
            "company_name": "示例公司",
            "recruitment_batch": "2027届秋招",
            "job_positions": "产品经理",
            **overrides,
        }
    )
    return values


class PendingBatchMissingLinkTests(unittest.TestCase):
    def test_unlinked_candidate_is_auto_skipped_before_enumeration(self):
        state = PendingBatchState(
            batch_id="batch-1",
            candidates=[
                PendingCandidate(
                    number=1,
                    company="无链接公司",
                    source_id="source-1",
                    source_record_id="record-1",
                    normalized_snapshot=snapshot(),
                ),
                PendingCandidate(
                    number=2,
                    company="有链接公司",
                    announcement_url="https://example.com/jobs",
                    source_id="source-1",
                    source_record_id="record-2",
                    normalized_snapshot=snapshot(source_url="https://example.com/jobs"),
                ),
            ],
            sources=[PendingSourceCheckpoint(source_id="source-1", high_water="100")],
        )
        self.assertEqual(state.skipped_numbers, [1])
        self.assertEqual([item.number for item in state.remaining], [2])

    def test_legacy_json_is_cleaned_on_restore(self):
        payload = (
            '{"schema_version":2,"batch_id":"batch-legacy","candidates":['
            '{"number":1,"company":"旧记录","role":"","reason":"旧规则",'
            '"announcement_url":"","application_url":"",'
            '"source_record_id":"record-1","source_record_exists":true,'
            '"source_id":"source-1","normalized_snapshot":'
            + __import__("json").dumps(snapshot(), ensure_ascii=False)
            + '}],"sources":[{"source_id":"source-1","high_water":"100",'
            '"recovery_checkpoint":""}],"written_numbers":[],"skipped_numbers":[],'
            '"completion_notification_succeeded":false,"committed_source_ids":[],'
            '"notification_state":{"run_id":"batch-legacy","stages":{}}}'
        )
        state = PendingBatchState.from_json(payload)
        self.assertEqual(state.skipped_numbers, [1])
        self.assertEqual(state.remaining, [])


if __name__ == "__main__":
    unittest.main()
