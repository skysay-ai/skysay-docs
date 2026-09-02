"""Offline contract for the release-log lane checkpoint."""

from __future__ import annotations

import json
import re
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")


class ReleaseStateTests(unittest.TestCase):
    def test_checkpoint_has_exact_live_lanes_and_a_matching_log_date(self) -> None:
        state = json.loads((ROOT / "release-state.json").read_text(encoding="utf-8"))

        self.assertEqual(state["version"], 1)
        self.assertEqual(set(state["lanes"]), {"api", "web", "voice"})
        for revision in state["lanes"].values():
            self.assertRegex(revision, FULL_SHA)
        self.assertRegex(state["updated_at"], r"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+Z$")
        updated = datetime.fromisoformat(state["updated_at"].replace("Z", "+00:00"))

        changelog = (ROOT / "content" / "docs" / "changelog.mdx").read_text(
            encoding="utf-8"
        )
        heading = f"## {updated.day} {updated.strftime('%B')} {updated.year}"
        self.assertIn(heading, changelog)


if __name__ == "__main__":
    unittest.main()
