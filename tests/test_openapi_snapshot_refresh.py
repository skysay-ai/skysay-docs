"""The snapshot refresh is the one writer of the snapshot, its coverage and the page."""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ("generate_openapi_reference.py", "refresh_openapi_snapshot.py")


def load_script(name: str):
    spec = importlib.util.spec_from_file_location(f"skysay_{name[:-3]}", ROOT / "scripts" / name)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def changed_summary_schema(schema: dict) -> dict:
    """The checked-in snapshot with one covered operation's summary changed."""
    changed = copy.deepcopy(schema)
    changed["paths"]["/v1/calls"]["post"]["summary"] = "A summary the page has never shown"
    return changed


class SnapshotRefreshTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.schema = json.loads((ROOT / "api" / "openapi.json").read_text(encoding="utf-8"))
        self.coverage_text = (ROOT / "api" / "customer-api-coverage.json").read_text(encoding="utf-8")

    def test_command_line_refresh_leaves_a_page_that_passes_the_ci_check(self) -> None:
        # The CI failure: the snapshot was rewritten and the page was not.
        # Run the real commands in a copy of the repository layout.
        for name in SCRIPTS:
            (self.tmp / "scripts").mkdir(exist_ok=True)
            shutil.copy(ROOT / "scripts" / name, self.tmp / "scripts" / name)
        (self.tmp / "api").mkdir()
        (self.tmp / "content" / "docs").mkdir(parents=True)
        shutil.copy(ROOT / "api" / "openapi.json", self.tmp / "api" / "openapi.json")
        shutil.copy(ROOT / "api" / "customer-api-coverage.json", self.tmp / "api" / "customer-api-coverage.json")
        shutil.copy(ROOT / "content" / "docs" / "api-reference.mdx", self.tmp / "content" / "docs" / "api-reference.mdx")
        source = self.tmp / "export.json"
        source.write_text(json.dumps(changed_summary_schema(self.schema)), encoding="utf-8")
        coverage = self.tmp / "public-api-coverage.json"
        coverage.write_text(self.coverage_text, encoding="utf-8")

        refreshed = subprocess.run(
            [sys.executable, "scripts/refresh_openapi_snapshot.py", "--from", "-", "--coverage", str(coverage)],
            cwd=self.tmp,
            input=source.read_text(encoding="utf-8"),
            capture_output=True,
            text=True,
        )
        self.assertEqual(refreshed.returncode, 0, refreshed.stderr)
        check = subprocess.run(
            [sys.executable, "scripts/generate_openapi_reference.py", "--check"],
            cwd=self.tmp,
            capture_output=True,
            text=True,
        )
        self.assertEqual(check.returncode, 0, check.stderr)
        page = (self.tmp / "content" / "docs" / "api-reference.mdx").read_text(encoding="utf-8")
        self.assertIn("A summary the page has never shown", page)
        self.assertEqual((self.tmp / "api" / "customer-api-coverage.json").read_text(encoding="utf-8"), self.coverage_text)

    def test_inputs_that_cannot_form_a_page_write_nothing(self) -> None:
        refresh = load_script("refresh_openapi_snapshot.py")
        coverage = json.loads(self.coverage_text)
        coverage["covered_customer_operations"].append("GET /v1/not-in-the-snapshot")
        paths = {
            "snapshot_path": self.tmp / "openapi.json",
            "coverage_path": self.tmp / "coverage.json",
            "output_path": self.tmp / "api-reference.mdx",
        }
        with self.assertRaises(refresh.SnapshotError):
            refresh.refresh(self.schema, json.dumps(coverage), **paths)
        self.assertEqual(sorted(self.tmp.iterdir()), [])

    def test_stale_check_prints_the_difference(self) -> None:
        generator = load_script("generate_openapi_reference.py")
        stale = self.tmp / "api-reference.mdx"
        stale.write_text(generator.render(changed_summary_schema(self.schema), json.loads(self.coverage_text)), encoding="utf-8")
        generator.OUTPUT_PATH = stale
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            status = generator.main(["--check"])
        self.assertEqual(status, 1)
        self.assertIn("refresh_openapi_snapshot.py", stderr.getvalue())
        self.assertIn("-| `POST` | `/v1/calls` | A summary the page has never shown", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
