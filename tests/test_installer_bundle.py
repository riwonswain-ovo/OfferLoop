from pathlib import Path
import hashlib
import importlib.util
import json
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_installer_bundle.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("offerloop_bundle", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class InstallerBundleTest(unittest.TestCase):
    def setUp(self):
        self.builder = load_builder()

    def test_bundle_is_deterministic_minimal_and_self_describing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = self.builder.build_bundle(root / "first")
            second = self.builder.build_bundle(root / "second")
            first_archive = Path(first["archive"])
            second_archive = Path(second["archive"])

            self.assertEqual(first_archive.name, "OfferLoop-v0.1.0-alpha.16.zip")
            self.assertEqual(first_archive.read_bytes(), second_archive.read_bytes())
            self.assertEqual(first["sha256"], second["sha256"])
            self.assertLessEqual(
                first["compressed_bytes"], self.builder.MAX_COMPRESSED_BYTES
            )
            self.assertEqual(
                hashlib.sha256(first_archive.read_bytes()).hexdigest(),
                first["sha256"],
            )

            manifest = json.loads(Path(first["manifest"]).read_text(encoding="utf-8"))
            self.assertEqual(manifest["offerloop_version"], "0.1.0-alpha.16")
            paths = [entry["path"] for entry in manifest["entries"]]
            self.assertEqual(paths, sorted(paths))
            self.assertEqual(manifest["entry_count"], len(paths))
            self.assertIn("scripts/setup_offerloop.py", paths)
            self.assertIn("scripts/install_offerloop.py", paths)
            self.assertIn("VERSION", paths)
            self.assertIn(
                "runtime/offerloop/admin/assets/progress-sync-template/template.json",
                paths,
            )
            self.assertIn(
                "runtime/offerloop/admin/assets/progress-sync-template/server/modules/"
                "job-progress-sync/job-progress-sync.automation.ts",
                paths,
            )
            self.assertIn(
                "runtime/offerloop/admin/assets/progress-sync-template/test/fixtures/"
                "daily-checkin-cases.json",
                paths,
            )
            skill_names = {
                Path(path).parts[1]
                for path in paths
                if path.startswith("skills/") and len(Path(path).parts) > 2
            }
            self.assertEqual(skill_names, set(self.builder._load_installer().SKILL_NAMES))
            forbidden = {
                "node_modules",
                "tests",
                "evals",
                "dist",
                "build",
                "evaluation",
                "skill-evaluation",
                "skill-registry",
            }
            for path in paths:
                self.assertTrue(
                    path in self.builder.TOP_LEVEL_FILES
                    or path in self.builder.ENTRYPOINTS
                    or path.startswith("skills/")
                    or path.startswith("runtime/offerloop/workspace/")
                    or path.startswith("runtime/offerloop/admin/scripts/")
                    or path.startswith("runtime/offerloop/admin/references/")
                    or path.startswith("runtime/offerloop/admin/assets/")
                )
                self.assertFalse(forbidden.intersection(Path(path).parts), path)

            archive_root = manifest["archive_root"]
            with zipfile.ZipFile(first_archive) as archive:
                names = archive.namelist()
                self.assertEqual(names, sorted(names))
                embedded = json.loads(
                    archive.read(f"{archive_root}/BUNDLE-MANIFEST.json")
                )
                self.assertEqual(embedded, manifest)
                for entry in manifest["entries"]:
                    payload = archive.read(f"{archive_root}/{entry['path']}")
                    self.assertEqual(len(payload), entry["size"])
                    self.assertEqual(
                        hashlib.sha256(payload).hexdigest(), entry["sha256"]
                    )


if __name__ == "__main__":
    unittest.main()
