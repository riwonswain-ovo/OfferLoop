from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.execution_contract import ExecutionContract


def identity(record_id, source_id="source-a"):
    return {
        "stable_key": f"{source_id}:{record_id}",
        "source_id": source_id,
        "source_record_id": record_id,
    }


def routed(record_id, route, source_id="source-a"):
    return {**identity(record_id, source_id), "route": route}


def batch(*items):
    return {
        "stable_keys": [item["stable_key"] for item in items],
        "records": list(items),
    }


def normalize_all(guard, *record_ids, no_link_ids=()):
    guard.register_source_records([identity(record_id) for record_id in record_ids])
    for record_id in record_ids:
        guard.record_normalize(
            {
                **identity(record_id),
                "normalized_record": {
                    "company_name": record_id,
                    "source_url": (
                        "" if record_id in no_link_ids else f"https://example/{record_id}"
                    ),
                    "official_url": "",
                },
            }
        )


class ExecutionContractTest(unittest.TestCase):
    def test_empty_scan_finalizes_without_empty_write_or_pending_calls(self):
        guard = ExecutionContract()
        guard.register_source_records([])
        guard.notification_succeeded()
        guard.advance_cursor()
        guard.evaluation_finalize(summary=guard.confirmed_summary())
        self.assertFalse(
            any(
                event.startswith(("target.write", "target.verify", "pending.create"))
                for event in guard.events
            )
        )
        self.assertEqual(guard.finalize_attempts, 1)

    def test_every_record_normalizes_and_routes_with_an_explicit_enum_before_dedupe(self):
        guard = ExecutionContract()
        normalize_all(guard, "record-1", "record-2", "record-3")

        with self.assertRaisesRegex(ValueError, "top-level route"):
            guard.candidate_route(identity("record-1"))
        with self.assertRaisesRegex(ValueError, "unsupported route"):
            guard.candidate_route({**identity("record-1"), "route": "auto_write_or_confirm"})

        guard.candidate_route(routed("record-1", "hard_filtered"))
        guard.candidate_route(routed("record-2", "auto_write"))
        with self.assertRaisesRegex(RuntimeError, "every source record"):
            guard.candidate_dedupe(
                {**routed("record-2", "auto_write"), "dedupe_result": "unique"}
            )
        guard.candidate_route(routed("record-3", "hard_filtered"))
        guard.candidate_dedupe(
            {**routed("record-2", "auto_write"), "dedupe_result": "unique"}
        )
        writable = routed("record-2", "auto_write")
        guard.target_write(batch(writable))
        guard.target_verify(batch(writable))
        guard.notification_succeeded()
        guard.advance_cursor()
        guard.evaluation_finalize(summary=guard.confirmed_summary())

        self.assertEqual(guard.finalize_attempts, 1)
        self.assertEqual(
            guard.confirmed_summary(),
            {"written": 1, "pending": 0, "hard_filtered": 2, "duplicate": 0},
        )

    def test_all_hard_filtered_records_keep_independent_routes_without_noop_tools(self):
        guard = ExecutionContract()
        normalize_all(guard, "record-1", "record-2", "record-3")
        for record_id in ("record-1", "record-2", "record-3"):
            guard.candidate_route(routed(record_id, "hard_filtered"))
        guard.notification_succeeded()
        guard.advance_cursor()
        guard.evaluation_finalize(summary=guard.confirmed_summary())
        self.assertEqual(guard.confirmed_summary()["hard_filtered"], 3)
        self.assertFalse(
            any(
                event.startswith(("candidate.dedupe", "target.write", "pending.create"))
                for event in guard.events
            )
        )
        self.assertEqual(guard.finalize_attempts, 1)

    def test_missing_link_records_use_traceable_batches_and_exact_destinations(self):
        guard = ExecutionContract()
        normalize_all(guard, "partial-link", "no-links", no_link_ids={"no-links"})
        partial = routed("partial-link", "auto_write")
        missing = routed("no-links", "awaiting_write_confirmation")
        guard.candidate_route(partial)
        guard.candidate_route(missing)
        guard.candidate_dedupe({**partial, "dedupe_result": "unique"})
        guard.candidate_dedupe({**missing, "dedupe_result": "unique"})

        with self.assertRaisesRegex(ValueError, "top-level stable_keys"):
            guard.pending_create({"pending": [missing]})
        with self.assertRaisesRegex(RuntimeError, "full pending set"):
            guard.pending_create(batch(partial))
        with self.assertRaisesRegex(RuntimeError, "non-auto_write"):
            guard.target_write(batch(missing))

        guard.target_write(batch(partial))
        guard.target_verify(batch(partial))
        guard.pending_create(batch(missing))
        guard.notification_succeeded()
        guard.evaluation_finalize(summary=guard.confirmed_summary())

        self.assertEqual(guard.write_verified, {"source-a:partial-link"})
        self.assertEqual(guard.pending_persisted, {"source-a:no-links"})
        self.assertLess(
            guard.events.index("record.normalize:source-a:partial-link"),
            guard.events.index("candidate.route:source-a:partial-link:auto_write"),
        )
        self.assertLess(
            guard.events.index("target.write:source-a:partial-link"),
            guard.events.index("target.verify:source-a:partial-link"),
        )
        self.assertEqual(guard.finalize_attempts, 1)

    def test_two_no_link_records_are_persisted_once_and_never_written(self):
        guard = ExecutionContract()
        normalize_all(
            guard,
            "no-links-1",
            "no-links-2",
            no_link_ids={"no-links-1", "no-links-2"},
        )
        items = [
            routed("no-links-1", "awaiting_write_confirmation"),
            routed("no-links-2", "awaiting_write_confirmation"),
        ]
        with self.assertRaisesRegex(RuntimeError, "two missing links"):
            guard.candidate_route(routed("no-links-1", "auto_write"))
        for item in items:
            guard.candidate_route(item)
        for item in items:
            guard.candidate_dedupe({**item, "dedupe_result": "unique"})
        with self.assertRaisesRegex(RuntimeError, "full pending set"):
            guard.pending_create(batch(items[0]))
        guard.pending_create(batch(*items))
        with self.assertRaisesRegex(RuntimeError, "full pending set"):
            guard.pending_create(batch(*items))
        self.assertEqual(guard.written, set())

    def test_first_finalize_cannot_be_used_as_a_missing_step_oracle(self):
        guard = ExecutionContract()
        normalize_all(guard, "record-1")
        item = routed("record-1", "auto_write")
        guard.candidate_route(item)
        guard.candidate_dedupe({**item, "dedupe_result": "unique"})

        with self.assertRaisesRegex(RuntimeError, "independent dispositions"):
            guard.evaluation_finalize()
        guard.target_write(batch(item))
        guard.target_verify(batch(item))
        guard.notification_succeeded()
        guard.advance_cursor()
        with self.assertRaisesRegex(RuntimeError, "invalid after an incomplete first"):
            guard.evaluation_finalize()

    def test_completion_summary_must_equal_tool_confirmed_state(self):
        guard = ExecutionContract()
        normalize_all(guard, "record-1")
        item = routed("record-1", "hard_filtered")
        guard.candidate_route(item)
        guard.notification_succeeded()
        guard.advance_cursor()
        with self.assertRaisesRegex(RuntimeError, "contradicts"):
            guard.evaluation_finalize(
                summary={"written": 1, "pending": 0, "hard_filtered": 0, "duplicate": 0}
            )

    def test_schema_drift_first_finalize_only_after_audit_and_proposal(self):
        guard = ExecutionContract()
        guard.detect_schema_drift()
        guard.target_audit()
        guard.mapping_propose()
        guard.evaluation_finalize(status="awaiting_user_confirmation")
        self.assertEqual(guard.finalize_attempts, 1)
        self.assertEqual(
            guard.events[-1], "evaluation.finalize:awaiting_user_confirmation"
        )


if __name__ == "__main__":
    unittest.main()
