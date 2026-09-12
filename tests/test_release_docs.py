"""The docs release may change one image tag, never the cohosted application."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("release_docs", ROOT / "scripts/release_docs.py")
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
SOURCE = {"sha": "a" * 40, "tree": "b" * 40}
PRIMITIVES = {"sha": "c" * 40, "tree": "d" * 40, "blobs": {p: "e" * 64 for p in r.PRIMITIVES}}
OLD = {"tag": "docs-12345678", "digest": "sha256:" + "1" * 64}
NEW = {"tag": "docs-" + SOURCE["sha"], "digest": "sha256:" + "2" * 64}
DEPLOYMENT = "12345678-1234-1234-1234-123456789012"


def app_spec():
    return {"name": "openphonex-web", "region": "ams", "services": [
        {"name": "web", "image": {"repository": "openphonex-web", "tag": "web-unchanged"}, "envs": [{"key": "PRIVATE", "type": "SECRET", "value": "EV[opaque-test-value]"}], "future_provider_field": {"preserve": True}},
        {"name": "openphonex-docs", "image": {"registry_type": "DOCR", "registry": r.REGISTRY, "repository": r.REPOSITORY, "tag": OLD["tag"]}, "http_port": 8080, "instance_count": 1},
    ], "ingress": {"rules": [{"component": {"name": "web"}}]}, "domains": [{"domain": "openphonex.com"}], "workers": [{"name": "foreign-worker", "envs": [{"key": "OTHER", "value": "EV[other-opaque-test-value]"}]}]}


def receipt(spec=None):
    return {"version": 1, "source": SOURCE, "primitives": PRIMITIVES,
            "adapter_sha256": r.hashlib.sha256(Path(r.__file__).read_bytes()).hexdigest(),
            "previous": OLD, "target": NEW, "spec_sha256": r.digest(spec or app_spec()),
            "deployment_id": DEPLOYMENT, "gate_sha256": "3" * 64, "probe_sha256": "4" * 64,
            "prepared_at": "2026-09-05T11:00:00+00:00"}


class ContractTests(unittest.TestCase):
    def test_only_docs_tag_changes_and_unknown_fields_and_secrets_survive(self):
        original = app_spec()
        changed = r.replace_tag(original, NEW["tag"])
        self.assertEqual(original, app_spec())
        self.assertEqual(changed["services"][0], original["services"][0])
        self.assertEqual(changed["workers"], original["workers"])
        self.assertEqual(changed["ingress"], original["ingress"])
        changed["services"][1]["image"]["tag"] = OLD["tag"]
        self.assertEqual(r.canonical(changed), r.canonical(original))

    def test_wrong_app_service_registry_and_duplicate_roster_refuse(self):
        bad = []
        for field, value in (("name", "other"), ("region", "nyc")):
            s = app_spec(); s[field] = value; bad.append(s)
        for field in ("registry", "registry_type", "repository"):
            s = app_spec(); s["services"][1]["image"][field] = "wrong"; bad.append(s)
        s = app_spec(); s["services"].append(copy.deepcopy(s["services"][1])); bad.append(s)
        s = app_spec(); s["services"][1]["github"] = {"repo": "other"}; bad.append(s)
        for s in bad:
            with self.subTest(s=s), self.assertRaises(r.Refused):
                r.replace_tag(s, NEW["tag"])

    def test_receipt_exact_schema_and_source_bound_tag(self):
        self.assertEqual(r.validate(receipt()), receipt())
        for change in ({"version": 2}, {"extra": "field"}, {"spec_sha256": "invalid"}, {"target": OLD}, {"primitives": {**PRIMITIVES, "blobs": []}}):
            with self.subTest(change=change), self.assertRaises(r.Refused):
                r.validate({**receipt(), **change})

    def test_clean_main_rejects_dirty_or_unmerged_commit(self):
        with patch.object(r, "command", side_effect=[SOURCE["sha"], " M README.md"]), self.assertRaisesRegex(r.Refused, "clean"):
            r.clean_main(ROOT)
        with patch.object(r, "command", side_effect=[SOURCE["sha"], "", "f" * 40 + " refs/heads/main"]), self.assertRaisesRegex(r.Refused, "current"):
            r.clean_main(ROOT)

    def test_alternate_shared_lease_root_is_refused(self):
        with patch.dict(os.environ, {"OPENPHONEX_RELEASE_STATE_ROOT": "/tmp/independent-lock"}), self.assertRaises(r.Refused):
            r.primitives(ROOT)

    def test_image_architecture_failure_prevents_running_container(self):
        module = types.SimpleNamespace(builder=lambda _: ("desktop-linux", "", ""))
        with patch.object(r, "command", side_effect=["unix:///local/docker.sock", "", "linux/arm64\n"]) as command, self.assertRaisesRegex(r.Refused, "amd64"):
            r.image_probe(module, NEW, SOURCE["sha"], ROOT)
        self.assertFalse(any("run" in call.args[0] for call in command.call_args_list))

    def test_remote_probe_daemon_is_refused_before_pull_or_run(self):
        module = types.SimpleNamespace(builder=lambda _: ("desktop-linux", "", ""))
        with patch.object(r, "command", return_value="ssh://another-host") as command, self.assertRaisesRegex(r.Refused, "local"):
            r.image_probe(module, NEW, SOURCE["sha"], ROOT)
        self.assertEqual(command.call_count, 1)

    def test_failed_run_after_container_creation_is_cleaned_by_owned_name(self):
        module = types.SimpleNamespace(builder=lambda _: ("desktop-linux", "", ""))
        with patch.object(r, "command", side_effect=["unix:///local/docker.sock", "", "linux/amd64", r.Refused("publish failed"), "owned-id", ""]) as command, self.assertRaises(r.Refused):
            r.image_probe(module, NEW, SOURCE["sha"], ROOT)
        run = command.call_args_list[3].args[0]
        removal = command.call_args_list[-1].args[0]
        self.assertEqual(removal[-1], run[run.index("--name") + 1])
        self.assertIn("rm", removal)

    def test_cleanup_read_failure_preserves_original_probe_error(self):
        module = types.SimpleNamespace(builder=lambda _: ("desktop-linux", "", ""))
        failure = r.Refused("original start failure")
        with patch.object(r, "command", side_effect=["unix:///local/docker.sock", "", "linux/amd64", failure, r.Refused("daemon unavailable")]), patch.object(r, "diagnostic") as diagnostic:
            with self.assertRaises(r.Refused) as raised:
                r.image_probe(module, NEW, SOURCE["sha"], ROOT)
        self.assertIs(raised.exception, failure)
        self.assertIn("probe_cleanup_failed", diagnostic.call_args.args[0])

    def test_cleanup_failure_does_not_resurrect_an_outer_handled_exception(self):
        module = types.SimpleNamespace(builder=lambda _: ("desktop-linux", "", ""))
        try:
            raise r.RollbackFailed("already handled by an outer caller")
        except r.RollbackFailed:
            with patch.object(r, "command", side_effect=["unix:///local/docker.sock", "", "linux/amd64", "owned-id", "127.0.0.1:12345", r.Refused("daemon unavailable")]), patch.object(r, "probe_url", return_value={}), patch.object(r, "parity", return_value="f" * 64), patch.object(r, "diagnostic"):
                with self.assertRaises(r.Refused) as raised:
                    r.image_probe(module, NEW, SOURCE["sha"], ROOT)
            self.assertNotIsInstance(raised.exception, r.RollbackFailed)
            self.assertIn("cleanup failed", str(raised.exception))

    def test_promote_command_requires_execute(self):
        with patch.object(r, "primitives", return_value=(MagicMock(), PRIMITIVES)), patch.object(r, "promote") as promote:
            self.assertEqual(r.main(["promote", "--app-repo", str(ROOT), "--receipt", "untrusted"]), 1)
        promote.assert_not_called()

    def test_cli_distinguishes_rollback_failure_from_successful_rollback(self):
        for failure, status in ((r.RollbackFailed("restore failed"), 2), (r.RolledBack("restored"), 1)):
            with self.subTest(status=status), patch.object(r, "primitives", return_value=(MagicMock(), PRIMITIVES)), patch.object(r, "read", return_value=receipt()), patch.object(r, "promote", side_effect=failure):
                self.assertEqual(r.main(["promote", "--app-repo", str(ROOT), "--receipt", "private", "--execute"]), status)

    def test_cli_execute_dispatches_only_the_verified_receipt(self):
        module = MagicMock()
        with patch.object(r, "primitives", return_value=(module, PRIMITIVES)), patch.object(r, "read", return_value=receipt()), patch.object(r, "promote") as promote:
            self.assertEqual(r.main(["promote", "--app-repo", str(ROOT), "--receipt", "private", "--execute"]), 0)
        promote.assert_called_once_with(module, receipt(), PRIMITIVES, ROOT)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        def private(path, create):
            path.mkdir(parents=True, exist_ok=True, mode=0o700)
            if path.is_symlink() or path.stat().st_mode & 0o077:
                raise r.Refused("unsafe private directory")
            return path
        self.module = types.SimpleNamespace(state_root=lambda: Path(self.temp.name), private_dir=private)

    def tearDown(self):
        self.temp.cleanup()

    def test_tampering_and_symlink_and_permissions_refused(self):
        p = r.save(self.module, "receipts", receipt())
        self.assertEqual(r.read(self.module, "receipts", p), receipt())
        self.assertNotIn("EV[", p.read_text())
        os.chmod(p, 0o644)
        with self.assertRaises(r.Refused): r.read(self.module, "receipts", p)
        os.chmod(p, 0o600)
        p.write_text("{}")
        with self.assertRaises(r.Refused): r.read(self.module, "receipts", p)
        p.unlink(); p.symlink_to(Path(self.temp.name) / "elsewhere")
        with self.assertRaises(r.Refused): r.read(self.module, "receipts", p)

    def test_receipt_outside_private_namespace_refused(self):
        with self.assertRaises(r.Refused):
            r.read(self.module, "receipts", ROOT / ("f" * 64 + ".json"))


class PromotionTests(unittest.TestCase):
    def setUp(self):
        self.spec = app_spec()
        self.deployment = DEPLOYMENT
        self.pending = None
        self.module = types.SimpleNamespace(
            PromotionLock=MagicMock(), app_data=lambda _: self.data(),
            direct_registry_digest=lambda _, __, tag: NEW["digest"] if tag == NEW["tag"] else OLD["digest"],
        )
        self.patches = [patch.object(r, "clean_main", return_value=SOURCE),
                        patch.object(r, "read", return_value={}),
                        patch.object(r, "directory", return_value=Path("/private/evidence")),
                        patch.object(r, "save", return_value=Path("/private/evidence/result.json")),
                        patch.object(r, "probe_url", return_value={"passed": True}),
                        patch.object(r, "parity", return_value="f" * 64),
                        patch.object(r, "update_spec", side_effect=self.update),
                        patch.object(r, "await_spec", side_effect=lambda _, expected: self.deployment)]
        self.mocks = [p.start() for p in self.patches]
        (self.clean_main, self.read_evidence, self.evidence_dir, self.save_evidence,
         self.probe, self.parity, self.update_spec, self.wait_spec) = self.mocks

    def tearDown(self):
        for p in reversed(self.patches): p.stop()

    def data(self):
        return {"id": r.APP_ID, "spec": copy.deepcopy(self.spec), "active_deployment": {"id": self.deployment, "phase": "ACTIVE", "spec": copy.deepcopy(self.spec)}, "in_progress_deployment": self.pending}

    def update(self, spec):
        self.spec = copy.deepcopy(spec)
        self.deployment = "22345678-1234-1234-1234-123456789012"

    def run_release(self, value=None):
        r.promote(self.module, value or receipt(), PRIMITIVES, ROOT)

    def test_success_and_idempotent_retry_never_build_or_push(self):
        with patch.object(r, "command", side_effect=AssertionError("promote must not build or push")):
            self.run_release()
            self.run_release()
        self.assertEqual(self.update_spec.call_count, 1)
        self.assertEqual(self.module.PromotionLock.call_count, 2)
        self.assertEqual(self.update_spec.call_args.args[0], r.replace_tag(app_spec(), NEW["tag"]))

    def test_drift_or_inflight_or_shared_lease_collision_prevents_update(self):
        for kind in ("foreign", "inflight", "lease", "deployment"):
            with self.subTest(kind=kind):
                self.spec = app_spec(); self.pending = None; self.deployment = DEPLOYMENT
                self.module.PromotionLock.side_effect = None
                if kind == "foreign": self.spec["services"][0]["image"]["tag"] = "other-web-release"
                if kind == "inflight": self.pending = {"id": "other", "phase": "BUILDING"}
                if kind == "lease": self.module.PromotionLock.side_effect = r.Refused("another promotion")
                if kind == "deployment": self.deployment = "different-deployment"
                with self.assertRaises(r.Refused): self.run_release()
        self.update_spec.assert_not_called()

    def test_source_or_primitive_drift_prevents_update(self):
        for change in ({"source": {**SOURCE, "tree": "f" * 40}}, {"primitives": {**PRIMITIVES, "blobs": {key: "f" * 64 for key in PRIMITIVES["blobs"]}}}, {"adapter_sha256": "f" * 64}):
            with self.subTest(change=change), self.assertRaises(r.Refused):
                self.run_release({**receipt(), **change})
        self.update_spec.assert_not_called()

    def test_unrelated_app_commit_does_not_invalidate_helper_bytes(self):
        self.run_release({**receipt(), "primitives": {**PRIMITIVES, "sha": "f" * 40, "tree": "e" * 40}})
        self.update_spec.assert_called()

    def test_target_or_previous_digest_collision_prevents_update(self):
        self.module.direct_registry_digest = lambda *_: "sha256:" + "f" * 64
        with self.assertRaisesRegex(r.Refused, "registry"):
            self.run_release()
        self.update_spec.assert_not_called()

    def test_failed_proof_rolls_back_only_own_tag_and_preserves_secrets(self):
        self.probe.side_effect = [r.Refused("new revision absent"), {"rollback_passed": True}]
        with self.assertRaisesRegex(r.Refused, "was rolled back"):
            self.run_release()
        self.assertEqual(self.spec, app_spec())
        self.assertEqual(self.update_spec.call_count, 2)
        self.assertEqual(self.save_evidence.call_args.args[2]["outcome"], "rolled_back")

    def test_failed_proof_with_foreign_spec_does_not_overwrite_it(self):
        def fail(*_):
            self.spec["services"][0]["image"]["tag"] = "foreign-new-web"
            raise r.Refused("proof failed")
        self.probe.side_effect = fail
        with self.assertRaises(r.RollbackFailed): self.run_release()
        self.assertEqual(self.spec["services"][0]["image"]["tag"], "foreign-new-web")
        self.assertEqual(self.update_spec.call_count, 1)
        self.assertEqual(self.save_evidence.call_args.args[2]["outcome"], "rollback_failed")

    def test_foreign_change_during_parity_is_not_certified_or_rolled_over(self):
        def concurrent_change(*_):
            self.spec["services"][0]["image"]["tag"] = "foreign-during-proof"
            return "f" * 64
        self.parity.side_effect = concurrent_change
        with self.assertRaises(r.RollbackFailed): self.run_release()
        self.assertEqual(self.update_spec.call_count, 1)
        self.assertEqual(self.spec["services"][0]["image"]["tag"], "foreign-during-proof")

    def test_registry_drift_during_successful_retry_proof_is_refused_without_update(self):
        self.spec = r.replace_tag(app_spec(), NEW["tag"])
        def repoint(*_):
            self.module.direct_registry_digest = lambda *_: "sha256:" + "f" * 64
            return "f" * 64
        self.parity.side_effect = repoint
        with self.assertRaisesRegex(r.Refused, "registry"): self.run_release()
        self.update_spec.assert_not_called()

    def test_rollback_failure_is_distinct(self):
        self.probe.side_effect = r.Refused("proof failed")
        def update_once(spec):
            if self.update_spec.call_count == 1:
                self.update(spec)
            else:
                raise r.Refused("rollback update failed")
        self.update_spec.side_effect = update_once
        with self.assertRaises(r.RollbackFailed): self.run_release()

    def test_evidence_disk_failure_cannot_downgrade_rollback_failure(self):
        failure = r.RollbackFailed("production restore requires attention")
        self.save_evidence.side_effect = OSError("disk full")
        with patch.object(r, "_promote", side_effect=failure), patch.object(r, "diagnostic") as diagnostic:
            with self.assertRaises(r.RollbackFailed) as raised:
                self.run_release()
        self.assertIs(raised.exception, failure)
        self.assertEqual(diagnostic.call_args.args[0], {"outcome": "rollback_failed", "evidence": None})

    def test_stderr_failure_cannot_downgrade_rollback_failure(self):
        with patch.object(r, "primitives", return_value=(self.module, PRIMITIVES)), patch.object(r, "_promote", side_effect=r.RollbackFailed("restore failed")), patch.object(r, "read", return_value=receipt()), patch("builtins.print", side_effect=BrokenPipeError()):
            self.assertEqual(r.main(["promote", "--app-repo", str(ROOT), "--receipt", "private", "--execute"]), 2)

    def test_update_refused_before_mutation_does_not_attempt_rollback(self):
        self.update_spec.side_effect = r.Refused("update rejected")
        with self.assertRaisesRegex(r.Refused, "before changing"):
            self.run_release()
        self.assertEqual(self.spec, app_spec())
        self.assertEqual(self.update_spec.call_count, 1)

    def test_desired_spec_is_not_active_spec_proof(self):
        value = self.data(); value["active_deployment"]["spec"]["services"][1]["image"]["tag"] = "docs-87654321"
        self.module.app_data = lambda _: value
        with self.assertRaisesRegex(r.Refused, "active"):
            self.run_release()
        self.update_spec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
