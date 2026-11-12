"""Offline contract for the release-log lane checkpoint."""

from __future__ import annotations

import json
import re
import unittest
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")
DATE_HEADING = re.compile(r"## ([0-9]{1,2} [A-Za-z]+ [0-9]{4})", re.ASCII)
# Any line Markdown may render as a level-1 or level-2 heading: an ATX heading
# (up to three spaces of indent, one or two #, then a space, a tab or the end),
# a setext underline, or an HTML h1/h2. Every such line must be exactly a
# DATE_HEADING, so no spelling of a release section escapes the date check.
TOP_HEADING = re.compile(r"^ {0,3}#{1,2}(?:[ \t]|$)|^ {0,3}(?:=+|-+)[ \t]*$|<h[12][\s>]", re.I)


def changelog_body_lines(changelog: str) -> list[str]:
    lines = changelog.splitlines()
    if lines and lines[0] == "---":
        end = lines.index("---", 1)
        return lines[end + 1 :]
    return lines


class ReleaseStateTests(unittest.TestCase):
    def assert_log_not_ahead_of_checkpoint(self, updated: datetime, changelog: str) -> None:
        # Checkpoints account for every verified release; editorial entries cover
        # only major changes. A state-only release need not add a dated entry.
        headings = []
        for line in changelog_body_lines(changelog):
            if not TOP_HEADING.search(line):
                continue
            match = DATE_HEADING.fullmatch(line)
            self.assertIsNotNone(
                match,
                f"release log: {line!r} renders as a top-level heading but is not "
                "exactly `## <day> <Month> <year>`",
            )
            headings.append(match.group(1))
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

    def test_no_spelling_of_a_later_section_escapes_the_date_check(self) -> None:
        history = "## 11 November 2026\n\n### Entry\n\n- A bullet.\n"
        for heading in (
            "## 12 November 2026",
            "## 12 November 2026 ",
            "## 12 November 2026 ##",
            "##\t12 November 2026",
            "##  12 November 2026",
            " ## 12 November 2026",
            "# 12 November 2026",
            "12 November 2026\n---",
            "12 November 2026\n===",
            "<h2>12 November 2026</h2>",
            "## 12 november 2026",
        ):
            with self.subTest(heading=heading):
                with self.assertRaises(AssertionError):
                    self.assert_log_not_ahead_of_checkpoint(
                        datetime(2026, 11, 11), f"{heading}\n\n### Entry\n\n- A bullet.\n\n{history}"
                    )

    def test_front_matter_and_entry_headings_are_not_release_sections(self) -> None:
        self.assert_log_not_ahead_of_checkpoint(
            datetime(2026, 11, 11),
            "---\ntitle: Release log\n---\n\n## 11 November 2026\n\n"
            "### Calls placed before 12 November 2026 keep their summary\n\n- A bullet.\n",
        )

    def test_release_log_must_retain_dated_history(self) -> None:
        with self.assertRaises(AssertionError):
            self.assert_log_not_ahead_of_checkpoint(datetime(2026, 9, 8), "No entries")


if __name__ == "__main__":
    unittest.main()
