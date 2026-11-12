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
# The release log's whole body follows the README's "Release log entry format":
# blank lines, `## <day> <Month> <year>` release sections, `### <title>` entries
# and `- <bullet>` lines, nothing else. Holding every line to that grammar is
# what lets the date check see every release section: no other spelling of a
# heading (indent, tab, trailing spaces, closing hashes, setext underline,
# HTML or JSX, a heading or list nested in a bullet, a continuation line) can
# get into the log at all.
ENTRY_LINE = re.compile(
    r"### [A-Za-z0-9].*"
    r"|- (?:[A-Za-z`\[]|\*\*[^\s*]|[0-9](?![0-9]*[.)](?:\s|$))).*",
    re.ASCII,
)
CODE_SPAN = re.compile(r"`[^`]*`")
# Characters Python splits lines on (or Markdown treats as whitespace) beyond
# the newline: with none of them in the log, both read the same lines.
CONTROL = re.compile(r"[\x00-\x09\x0b-\x1f\x7f-\x9f  ]")


# Front matter is `---`, single-line `key: value` lines, then `---`. Holding it
# to that shape means no front-matter parser can close it somewhere else and
# leave rendered lines this check took for front matter.
FRONT_MATTER_LINE = re.compile(r"[a-z][A-Za-z0-9_]*: [A-Za-z0-9].*", re.ASCII)


def changelog_body_lines(changelog: str) -> list[str]:
    lines = changelog.splitlines()
    if not lines or lines[0] != "---":
        return lines
    for index, line in enumerate(lines[1:], start=1):
        if line == "---":
            return lines[index + 1 :]
        if not FRONT_MATTER_LINE.fullmatch(line):
            raise AssertionError(
                f"release log front matter line {index + 1} {line!r} is not "
                "`key: value`; the front matter ends at a line that is exactly `---`"
            )
    raise AssertionError("release log front matter has no closing `---` line")


def release_log_format_error(line: str) -> str | None:
    if line == "" or DATE_HEADING.fullmatch(line):
        return None
    if not ENTRY_LINE.fullmatch(line):
        return "is not a blank line, `## <day> <Month> <year>`, `### <title>` or `- <bullet>`"
    # Raw HTML, JSX and MDX expressions only inside code spans. Code spans are
    # single backticks, paired in order: a backslash before a backtick, a run of
    # two or more backticks or an unpaired backtick would let Markdown pair the
    # spans differently from CODE_SPAN, so each is refused.
    if "\\`" in line:
        return "has an escaped backtick"
    if "``" in line:
        return "has a run of two or more backticks"
    if line.count("`") % 2:
        return "has an unpaired backtick"
    if re.search(r"[<>{}]", CODE_SPAN.sub("", line)):
        return "has `<`, `>`, `{` or `}` outside a code span"
    return None


class ReleaseStateTests(unittest.TestCase):
    def assert_log_not_ahead_of_checkpoint(self, updated: datetime, changelog: str) -> None:
        # Checkpoints account for every verified release; editorial entries cover
        # only major changes. A state-only release need not add a dated entry.
        control = CONTROL.search(changelog)
        self.assertIsNone(
            control,
            f"release log has the control or line-separator character {control and control.group()!r}",
        )
        headings = []
        for number, line in enumerate(changelog_body_lines(changelog), start=1):
            error = release_log_format_error(line)
            self.assertIsNone(
                error,
                f"release log body line {number} {line!r} {error}; see the README, "
                '"Release log entry format"',
            )
            match = DATE_HEADING.fullmatch(line)
            if match:
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
            "<h2\n>12 November 2026</h2>",
            "<Heading level={2}>12 November 2026</Heading>",
            "## 12 november 2026",
            "- ## 12 November 2026",
            "- > ## 12 November 2026",
            "- 12 November 2026\n  ---",
            "- A bullet <h2>12 November 2026</h2>",
            "- A bullet \\`<h2>12 November 2026</h2>\\`",
            "- ``a`b``<h2>12 November 2026</h2>`",
            "- `a`` <h2>12 November 2026</h2>",
            "- `a` `<h2>12 November 2026</h2>",
            "- A bullet.\x0c## 12 November 2026",
            "## 11 November 2026 ## 12 November 2026",
            "- A bullet.\x85x",
            "### Entry\n12 November 2026\n---",
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

    def test_front_matter_cannot_hide_a_later_section(self) -> None:
        later = "## 12 November 2026\n\n### Entry\n\n- A bullet.\n"
        history = "## 11 November 2026\n\n### Entry\n\n- A bullet.\n"
        for front_matter in (
            f"---\ntitle: Release log\n--- \n{later}---\n",
            f"---\ntitle: Release log\n---x\n{later}---\n",
            f"---\ntitle: Release log\n...\n{later}---\n",
            f"---\ntitle: Release log\n{later}",
            f"---\ntitle: |\n  {later}---\n",
        ):
            with self.subTest(front_matter=front_matter):
                with self.assertRaises(AssertionError):
                    self.assert_log_not_ahead_of_checkpoint(
                        datetime(2026, 11, 11), f"{front_matter}\n{history}"
                    )

    def test_entry_lines_in_the_readme_format_pass(self) -> None:
        for line in (
            "### Self-serve outbound campaigns",
            "- Upload a contact list and launch an agent.",
            "- **Call one contact now** places one real call.",
            "- `GET /v1/campaigns/{campaign_id}/export` appends an `extraction.<field>` column.",
            "- [Read Campaigns](/docs/campaigns) · [Do-not-call](/docs/campaigns#do-not-call-register)",
            "- 30 days of history are kept.",
        ):
            with self.subTest(line=line):
                self.assertIsNone(release_log_format_error(line))

    def test_release_log_must_retain_dated_history(self) -> None:
        with self.assertRaises(AssertionError):
            self.assert_log_not_ahead_of_checkpoint(datetime(2026, 9, 8), "No entries")


if __name__ == "__main__":
    unittest.main()
