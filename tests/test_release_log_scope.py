"""Only a release-log pull request, which moves the checkpoint, edits the release log.

A feature pull request that adds a dated section to the release log before its
release is red by construction (the date test in test_release_state.py refuses
a log date after the checkpoint), and turns red again whenever the date rolls
over. This check refuses that shape with an instruction instead.

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
FEATURE_PR_MESSAGE = (
    "Feature PRs do not edit the release log. Put the proposed entry in the PR "
    "description under the heading `Release log entry`; the release agent adds "
    "it at release."
)


def release_log_scope_violation(changed_paths: Iterable[str]) -> str | None:
    paths = set(changed_paths)
    if CHANGELOG in paths and RELEASE_STATE not in paths:
        return FEATURE_PR_MESSAGE
    return None


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
    def test_this_pull_request_does_not_edit_the_release_log_without_the_checkpoint(
        self,
    ) -> None:
        if os.environ.get("GITHUB_EVENT_NAME") != "pull_request":
            self.skipTest("not a pull_request run: no change set to judge")
        violation = release_log_scope_violation(pull_request_changed_paths())
        if violation:
            self.fail(violation)

    def test_feature_pr_editing_the_log_is_refused_with_the_instruction(self) -> None:
        # The change set of the campaigns drafts held for a release.
        changed = [
            "api/customer-api-coverage.json",
            "api/openapi.json",
            "content/docs/api-reference.mdx",
            "content/docs/campaigns.mdx",
            CHANGELOG,
        ]
        self.assertEqual(release_log_scope_violation(changed), FEATURE_PR_MESSAGE)
        self.assertEqual(release_log_scope_violation([CHANGELOG]), FEATURE_PR_MESSAGE)

    def test_release_log_pr_moving_the_checkpoint_passes(self) -> None:
        self.assertIsNone(release_log_scope_violation([CHANGELOG, RELEASE_STATE]))
        self.assertIsNone(
            release_log_scope_violation(
                ["api/openapi.json", "content/docs/api-reference.mdx", CHANGELOG, RELEASE_STATE]
            )
        )

    def test_state_only_and_docs_only_prs_pass(self) -> None:
        self.assertIsNone(release_log_scope_violation([RELEASE_STATE]))
        self.assertIsNone(
            release_log_scope_violation(["content/docs/campaigns.mdx", "content/docs/contacts.mdx"])
        )
        self.assertIsNone(release_log_scope_violation([]))


if __name__ == "__main__":
    unittest.main()
