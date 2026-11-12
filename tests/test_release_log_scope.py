"""A pull request that edits the release log changes nothing but release-log files.

Besides content/docs/changelog.mdx, such a pull request may change only the
checkpoint (release-state.json) and the generated API reference snapshot that
the release-log pull request regenerates. A log-only pull request (follow-up
entries for a release already checkpointed, a typo or layout fix) passes; the
date test in test_release_state.py still refuses a log section dated after the
checkpoint. A log edit together with any other file (a feature page, a guide,
navigation) is refused with an instruction.

A feature pull request that adds a dated section to the release log before its
release is red by construction (the date test refuses a log date after the
checkpoint) and turns red again whenever the date rolls over; this check
refuses that shape with an instruction instead.

On a pull_request run, actions/checkout checks out the pull request's merge
commit; its first parent is the base branch tip, so the diff between the two is
exactly the pull request's change set. The api-reference job checks out with
fetch-depth 2 so that parent is present. Outside a pull request (a push to main,
a local run) there is no change set to judge and the live check is skipped.
"""

from __future__ import annotations

import os
import subprocess
import unittest
from collections.abc import Iterable
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHANGELOG = "content/docs/changelog.mdx"
RELEASE_STATE = "release-state.json"
# The files a release-log pull request may change besides the log: the
# checkpoint and the generated API reference snapshot.
RELEASE_LOG_FILES = frozenset(
    {
        CHANGELOG,
        RELEASE_STATE,
        "api/openapi.json",
        "api/customer-api-coverage.json",
        "content/docs/api-reference.mdx",
    }
)
FEATURE_PR_MESSAGE = (
    "Feature PRs do not edit the release log. Put the proposed entry in the PR "
    "description under the heading `Release log entry`; the release agent adds "
    "it at release."
)


def release_log_scope_violation(changed_paths: Iterable[str]) -> str | None:
    paths = set(changed_paths)
    if CHANGELOG not in paths:
        return None
    others = sorted(paths - RELEASE_LOG_FILES)
    if not others:
        return None
    return (
        f"{FEATURE_PR_MESSAGE} This pull request changes {CHANGELOG} together "
        f"with files outside the release log: {', '.join(others)}."
    )


def git(*args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout


def pull_request_changed_paths() -> list[str]:
    parents = git("rev-list", "--parents", "-n", "1", "HEAD").split()
    if len(parents) != 3:
        raise AssertionError(
            "pull_request run: HEAD is not the pull request's two-parent merge "
            "commit with its base parent present; check out the merge ref with "
            "fetch-depth: 2 (.github/workflows/ci.yml, api-reference job)"
        )
    _, base, _ = parents
    return [
        line
        for line in git("diff", "--name-only", "--no-renames", base, "HEAD").splitlines()
        if line
    ]


class ReleaseLogScopeTests(unittest.TestCase):
    def test_this_pull_request_edits_the_release_log_only_with_release_log_files(
        self,
    ) -> None:
        if os.environ.get("GITHUB_EVENT_NAME") != "pull_request":
            self.skipTest("not a pull_request run: no change set to judge")
        violation = release_log_scope_violation(pull_request_changed_paths())
        if violation:
            self.fail(violation)

    # Change sets of merged pull requests, exactly as they landed on main.
    RELEASE_LOG_PR_461 = [
        "api/customer-api-coverage.json",
        "api/openapi.json",
        "content/docs/api-reference.mdx",
        CHANGELOG,
        RELEASE_STATE,
    ]
    FOLLOW_UP_ENTRIES_PR_463 = [CHANGELOG]
    FEATURE_PRS_WITH_LOG_ENTRY = {
        453: [CHANGELOG, "content/docs/how-calls-end.mdx", "public/diagrams/end-call-goodbye-check.svg"],
        455: [CHANGELOG, "content/docs/public-link.mdx", "content/docs/tool-reference.mdx"],
        456: ["content/docs/campaigns.mdx", CHANGELOG, "public/diagrams/campaign-contact-journey.svg"],
    }

    def test_release_log_pr_with_checkpoint_and_api_snapshot_passes(self) -> None:
        self.assertIsNone(release_log_scope_violation(self.RELEASE_LOG_PR_461))
        self.assertIsNone(release_log_scope_violation([CHANGELOG, RELEASE_STATE]))

    def test_log_only_pr_passes(self) -> None:
        # Follow-up entries for a checkpointed release, or a typo/layout fix.
        self.assertIsNone(release_log_scope_violation(self.FOLLOW_UP_ENTRIES_PR_463))

    def test_feature_pr_with_a_log_entry_is_refused_with_the_instruction(self) -> None:
        for number, changed in self.FEATURE_PRS_WITH_LOG_ENTRY.items():
            with self.subTest(pr=number):
                violation = release_log_scope_violation(changed)
                self.assertIsNotNone(violation)
                self.assertTrue(violation.startswith(FEATURE_PR_MESSAGE))
                for path in changed:
                    if path != CHANGELOG:
                        self.assertIn(path, violation)

    def test_held_draft_shape_is_refused_even_with_the_checkpoint(self) -> None:
        # The campaigns drafts' change set; adding release-state.json does not
        # make a feature page part of a release-log pull request.
        draft = [
            "api/customer-api-coverage.json",
            "api/openapi.json",
            "content/docs/api-reference.mdx",
            "content/docs/campaigns.mdx",
            CHANGELOG,
        ]
        for changed in (draft, [*draft, RELEASE_STATE]):
            with self.subTest(changed=changed):
                violation = release_log_scope_violation(changed)
                self.assertIsNotNone(violation)
                self.assertTrue(violation.startswith(FEATURE_PR_MESSAGE))
                self.assertTrue(violation.endswith("content/docs/campaigns.mdx."))

    def test_prs_that_do_not_touch_the_log_pass(self) -> None:
        self.assertIsNone(release_log_scope_violation([RELEASE_STATE]))
        self.assertIsNone(
            release_log_scope_violation(["content/docs/campaigns.mdx", "content/docs/contacts.mdx"])
        )
        self.assertIsNone(release_log_scope_violation(["api/openapi.json", "content/docs/api-reference.mdx"]))
        self.assertIsNone(release_log_scope_violation([]))

if __name__ == "__main__":
    unittest.main()
