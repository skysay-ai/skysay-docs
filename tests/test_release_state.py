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
    def assert_log_not_ahead_of_checkpoint(self, updated: datetime, changelog: str) -> None:
        # Checkpoints account for every verified release; editorial entries cover
        # only major changes. A state-only release need not add a dated entry.
        headings = re.findall(r"^## (\d{1,2} [A-Za-z]+ \d{4})$", changelog, re.MULTILINE)
        self.assertTrue(headings, "release log must retain its dated history")
        for heading in headings:
            self.assertLessEqual(datetime.strptime(heading, "%d %B %Y").date(), updated.date())

    def test_checkpoint_has_exact_live_lanes_and_covers_log_dates(self) -> None:
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
        self.assert_log_not_ahead_of_checkpoint(updated, changelog)

    def test_state_only_checkpoint_can_follow_the_last_editorial_entry(self) -> None:
        for day in (7, 8):
            with self.subTest(checkpoint_day=day):
                self.assert_log_not_ahead_of_checkpoint(
                    datetime(2026, 9, day), "## 7 September 2026\n\n## 6 September 2026\n"
                )

    def test_checkpoint_cannot_precede_an_editorial_entry(self) -> None:
        with self.assertRaises(AssertionError):
            self.assert_log_not_ahead_of_checkpoint(
                datetime(2026, 9, 7), "## 8 September 2026\n"
            )

    def test_release_log_must_retain_dated_history(self) -> None:
        with self.assertRaises(AssertionError):
            self.assert_log_not_ahead_of_checkpoint(datetime(2026, 9, 8), "No entries")


if __name__ == "__main__":
    unittest.main()
