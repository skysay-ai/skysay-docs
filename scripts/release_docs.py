#!/usr/bin/env python3
"""Prepare one immutable docs image; promote only its fenced private receipt.

The private app checkout supplies the shared promotion lease and registry guards.
Specs are never receipts: opaque secret values exist only in a temporary 0600 file.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
APP_ID = "7a0e8413-d3ab-4763-9286-0c944dd65be4"
REGISTRY = "property-intel-cr"
REPOSITORY = "openphonex-docs"
IMAGE = f"registry.digitalocean.com/{REGISTRY}/{REPOSITORY}"
PRIMITIVES = ("scripts/ci/prepared_release.py", "scripts/ci/registry_release_guard.sh", "scripts/ci/node22.sh")
SHA = re.compile(r"[0-9a-f]{40}\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
TAG = re.compile(r"docs-[0-9a-f]{8,40}\Z")


class Refused(RuntimeError):
    pass


class RollbackFailed(Refused):
    pass


class NotStarted(Refused):
    pass


class RolledBack(Refused):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def command(args, *, cwd=ROOT, timeout=180):
    env = {k: v for k, v in os.environ.items() if k not in {"GH_TOKEN", "GITHUB_TOKEN"}}
    try:
        result = subprocess.run(args, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise Refused(f"command timed out: {args[0]}") from exc
    if result.returncode:
        # doctl errors may include an app spec. Never print captured command output.
        raise Refused(f"command failed ({result.returncode}): {args[0]}")
    return result.stdout


def exact(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys.split()):
        raise Refused("unexpected receipt fields")


def match(pattern, value):
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise Refused("invalid receipt identity")


def clean_main(repo):
    sha = command(["git", "rev-parse", "HEAD"], cwd=repo).strip()
    if command(["git", "status", "--porcelain"], cwd=repo).strip():
        raise Refused("release checkout must be clean")
    remote = command(["git", "ls-remote", "origin", "refs/heads/main"], cwd=repo).split()
    if not remote or remote[0] != sha:
        raise Refused("release checkout must be exact current origin/main")
    return {"sha": sha, "tree": command(["git", "rev-parse", "HEAD^{tree}"], cwd=repo).strip()}


def primitives(app_repo):
    # A different state root would create an independent lease over the same app.
    if "OPENPHONEX_RELEASE_STATE_ROOT" in os.environ:
        raise Refused("alternate production lease root is not allowed")
    identity = clean_main(app_repo)
    identity["blobs"] = {path: hashlib.sha256((app_repo / path).read_bytes()).hexdigest() for path in PRIMITIVES}
    spec = importlib.util.spec_from_file_location("skysay_prepared_release", app_repo / PRIMITIVES[0])
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # Reuse the canonical lease, private state directory and registry read path.
    return module, identity


def docs_service(spec):
    if not isinstance(spec, dict) or spec.get("name") != "openphonex-web" or spec.get("region") != "ams":
        raise Refused("unexpected shared web app identity")
    services = spec.get("services")
    if not isinstance(services, list) or not all(isinstance(s, dict) for s in services):
        raise Refused("invalid shared service roster")
    rows = [s for s in services if s.get("name") == REPOSITORY or (isinstance(s.get("image"), dict) and s["image"].get("repository") == REPOSITORY)]
    if len(rows) != 1:
        raise Refused("expected exactly one docs service")
    row = rows[0]
    image = row.get("image") or {}
    if row.get("name") != REPOSITORY or image.get("registry_type") != "DOCR" or image.get("registry") != REGISTRY or image.get("repository") != REPOSITORY:
        raise Refused("unexpected docs image identity")
    if any(row.get(key) for key in ("git", "github", "gitlab")):
        raise Refused("docs component must be image based")
    match(TAG, image.get("tag"))
    return row


def replace_tag(spec, tag):
    match(TAG, tag)
    candidate = copy.deepcopy(spec)
    docs_service(candidate)["image"]["tag"] = tag
    restored = copy.deepcopy(candidate)
    docs_service(restored)["image"]["tag"] = docs_service(spec)["image"]["tag"]
    if canonical(restored) != canonical(spec):
        raise Refused("docs promotion changed a cohosted field")
    return candidate


def snapshot(module):
    data = module.app_data(APP_ID)
    if data.get("id") != APP_ID or data.get("in_progress_deployment"):
        raise Refused("unexpected app or in-flight deployment")
    deployment = data.get("active_deployment") or {}
    if deployment.get("phase") != "ACTIVE" or not deployment.get("id"):
        raise Refused("shared web app is not ACTIVE")
    spec = data.get("spec")
    docs_service(spec)
    # The desired spec alone is not evidence of the ACTIVE deployment's spec.
    if canonical(deployment.get("spec")) != canonical(spec):
        raise Refused("desired and active app specs differ")
    return spec, deployment["id"]


def validate(receipt):
    exact(receipt, "version source primitives adapter_sha256 previous target spec_sha256 deployment_id gate_sha256 probe_sha256 prepared_at")
    if type(receipt["version"]) is not int or receipt["version"] != 1:
        raise Refused("unsupported docs receipt")
    for key in ("source", "primitives"):
        exact(receipt[key], "sha tree" + (" blobs" if key == "primitives" else ""))
        for field in ("sha", "tree"):
            match(SHA, receipt[key][field])
    if not isinstance(receipt["primitives"]["blobs"], dict) or set(receipt["primitives"]["blobs"]) != set(PRIMITIVES):
        raise Refused("unexpected primitive blobs")
    for value in receipt["primitives"]["blobs"].values():
        match(HASH, value)
    for key in ("adapter_sha256", "spec_sha256", "gate_sha256", "probe_sha256"):
        match(HASH, receipt[key])
    for key in ("previous", "target"):
        exact(receipt[key], "tag digest")
        match(TAG, receipt[key]["tag"])
        match(DIGEST, receipt[key]["digest"])
    if receipt["target"]["tag"] != "docs-" + receipt["source"]["sha"]:
        raise Refused("image tag is not source bound")
    if not isinstance(receipt["deployment_id"], str) or not re.fullmatch(r"[0-9a-f-]{36}", receipt["deployment_id"]):
        raise Refused("invalid deployment fence")
    try:
        if dt.datetime.fromisoformat(receipt["prepared_at"]).tzinfo is None:
            raise ValueError("receipt timestamp must include a timezone")
    except (TypeError, ValueError) as exc:
        raise Refused("invalid receipt date") from exc
    return receipt


def directory(module, name):
    root = module.private_dir(module.state_root(), create=True)
    return module.private_dir(module.private_dir(root / "docs", create=True) / name, create=True)


def save(module, name, value):
    body = canonical(value)
    path = directory(module, name) / (hashlib.sha256(body).hexdigest() + ".json")
    if path.exists() or path.is_symlink():
        if path.is_symlink() or path.stat().st_mode & 0o077 or path.read_bytes() != body:
            raise Refused("unsafe evidence collision")
        return path
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(body)
    return path


def read(module, name, value):
    path = Path(value)
    if path.parent != directory(module, name) or path.is_symlink() or not re.fullmatch(r"[0-9a-f]{64}\.json", path.name):
        raise Refused("evidence must be a private content-addressed file")
    if not path.is_file() or path.stat().st_mode & 0o077 or path.stat().st_size > 1048576:
        raise Refused("evidence file is not private")
    body = path.read_bytes()
    if hashlib.sha256(body).hexdigest() != path.stem:
        raise Refused("evidence digest mismatch")
    value = json.loads(body)
    if body != canonical(value):
        raise Refused("evidence serialization is not canonical")
    return value


def request(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "openphonex-docs-release/1.0", "Cache-Control": "no-cache"}), timeout=15) as response:
        return response.status, response.headers, response.read()


def probe_url(base, revision=None):
    last = None
    for attempt in range(12):
        try:
            status, headers, body = request(base + "/docs?release_probe=" + str(time.time_ns()))
            if status == 200 and (revision is None or headers.get("X-OpenPhonex-Docs-Revision") == revision):
                break
            last = "revision header mismatch" if status == 200 else f"status {status}"
        except urllib.error.HTTPError as exc:
            last = f"status {exc.code}"
        except Exception as exc:
            last = type(exc).__name__
        time.sleep(2)
    else:
        raise Refused(f"docs route proof failed: {last}")
    result = {"docs_status": status, "revision": headers.get("X-OpenPhonex-Docs-Revision"), "body_sha256": hashlib.sha256(body).hexdigest()}
    for path in ("/docs/multilingual-outbound.md", "/llms.txt", "/llms-full.txt"):
        status, _, body = request(base + path + "?release_probe=" + str(time.time_ns()))
        if status != 200 or not body:
            raise Refused("docs corpus proof failed")
        result[path] = hashlib.sha256(body).hexdigest()
    return result


def image_probe(module, target, revision, app_repo):
    reference = IMAGE + "@" + target["digest"]
    context = module.builder(False)[0]
    docker = ["docker", "--context", context]
    endpoint = command(["docker", "context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]).strip()
    if not endpoint.startswith("unix://"):
        raise Refused("docs image probe requires a local Docker socket")
    command(docker + ["pull", "--platform", "linux/amd64", reference], timeout=600)
    arch = command(docker + ["image", "inspect", reference, "--format", "{{.Os}}/{{.Architecture}}"] ).strip()
    if arch != "linux/amd64":
        raise Refused("docs image is not linux/amd64")
    container = "openphonex-docs-probe-" + secrets.token_hex(16)
    original = None
    try:
        command(docker + ["run", "--name", container, "--detach", "--platform", "linux/amd64", "--publish", "127.0.0.1::8080", reference])
        port = command(docker + ["port", container, "8080/tcp"]).strip()
        if not re.fullmatch(r"127\.0\.0\.1:[0-9]+", port):
            raise Refused("image probe was not bound to loopback")
        base = "http://" + port
        proof = probe_url(base, revision)
        proof["parity_sha256"] = parity(app_repo, base)
        proof["architecture"] = arch
        return proof
    except BaseException as failure:
        original = failure
        raise
    finally:
        # run may create a container and then fail while publishing its port.
        # Query by our unguessable owned name so even that path is cleaned up.
        try:
            found = command(docker + ["ps", "--all", "--quiet", "--filter", "name=^/" + container + "$"]).strip()
            if found:
                command(docker + ["rm", "--force", container])
        except Exception:
            diagnostic({"probe_cleanup_failed": container})
            if original is None:
                raise Refused("owned docs probe container cleanup failed")


def parity(app_repo, base):
    output = command(["bash", str(app_repo / "scripts/ci/node22.sh"), "--require", "--", "node", "scripts/parity-check.mjs", "--local", base, "--no-live"], timeout=240)
    return hashlib.sha256(output.encode()).hexdigest()


def identity(module, item):
    actual = module.direct_registry_digest(REGISTRY, REPOSITORY, item["tag"])
    if actual != item["digest"]:
        raise Refused("docs registry identity changed")


def update_spec(spec):
    # Neither the raw spec nor doctl's response is printed or persisted.
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as file:
        os.chmod(file.name, 0o600)
        json.dump(spec, file)
        file.flush()
        command(["doctl", "apps", "update", APP_ID, "--spec", file.name], timeout=60)


def await_spec(module, expected):
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        data = module.app_data(APP_ID)
        if digest(data.get("spec")) != digest(expected):
            raise Refused("foreign shared spec change during deployment")
        active = data.get("active_deployment") or {}
        pending = data.get("in_progress_deployment") or {}
        if not pending and active.get("phase") == "ACTIVE" and digest(active.get("spec")) == digest(expected):
            return active["id"]
        if pending.get("phase") in {"ERROR", "CANCELED", "SUPERSEDED"}:
            raise Refused("docs deployment failed")
        print("Waiting for docs deployment", flush=True)
        time.sleep(15)
    raise Refused("docs deployment timed out")


def prepare(module, primitive_identity, app_repo):
    started = time.monotonic()
    source = clean_main(ROOT)
    spec, deployment = snapshot(module)
    previous = {"tag": docs_service(spec)["image"]["tag"]}
    previous["digest"] = module.direct_registry_digest(REGISTRY, REPOSITORY, previous["tag"])
    tag = "docs-" + source["sha"]
    module.guard("ensure_new_registry_tag", REGISTRY, REPOSITORY, tag)
    gate = {"source": source, "checks": {}}
    for args in ([sys.executable, "scripts/scan_secrets.py", "--self-test"], [sys.executable, "scripts/scan_secrets.py", "."], [sys.executable, "scripts/generate_openapi_reference.py", "--check"], [sys.executable, "-m", "unittest", "discover", "-s", "tests"]):
        gate["checks"][" ".join(args[1:])] = hashlib.sha256(command(args).encode()).hexdigest()
    context = module.builder(False)[0]
    command(["doctl", "registry", "login", "--expiry-seconds", "900"])
    # Archive only committed files: ignored local credentials cannot enter context.
    with tempfile.TemporaryDirectory(prefix="openphonex-docs-build-") as temporary:
        archive = Path(temporary) / "source.tar"
        command(["git", "archive", "--output", str(archive), source["sha"]])
        command(["tar", "-xf", str(archive), "-C", temporary])
        archive.unlink()
        metadata = Path(temporary) / "build-metadata.json"
        module.guard("ensure_new_registry_tag", REGISTRY, REPOSITORY, tag)
        command(["docker", "--context", context, "buildx", "build", "--platform", "linux/amd64", "--build-arg", "DOCS_REVISION=" + source["sha"], "--tag", IMAGE + ":" + tag, "--metadata-file", str(metadata), "--push", temporary], timeout=1800)
        built = json.loads(metadata.read_text())["containerimage.digest"]
    target = {"tag": tag, "digest": built}
    identity(module, target)
    proof = image_probe(module, target, source["sha"], app_repo)
    final_spec, final_deployment = snapshot(module)
    if digest(spec) != digest(final_spec) or deployment != final_deployment or clean_main(ROOT) != source:
        raise Refused("source or live fence changed while preparing docs")
    gate_path = save(module, "evidence", gate)
    proof_path = save(module, "evidence", proof)
    receipt = validate({"version": 1, "source": source, "primitives": primitive_identity, "adapter_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "previous": previous, "target": target, "spec_sha256": digest(spec), "deployment_id": deployment, "gate_sha256": gate_path.stem, "probe_sha256": proof_path.stem, "prepared_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    path = save(module, "receipts", receipt)
    print(json.dumps({"prepared_receipt": str(path), "elapsed_seconds": round(time.monotonic() - started, 3)}))


def final_fence(module, spec, deployment, target):
    final_spec, final_deployment = snapshot(module)
    if digest(final_spec) != digest(spec) or final_deployment != deployment:
        raise Refused("shared app spec or deployment changed during docs proofs")
    identity(module, target)


def _promote(module, receipt, primitive_identity, app_repo):
    started = time.monotonic()
    validate(receipt)
    # The app SHA/tree records provenance; only imported helper bytes bind docs.
    # primitives() still requires a clean, current-main app checkout.
    if clean_main(ROOT) != receipt["source"] or primitive_identity["blobs"] != receipt["primitives"]["blobs"] or hashlib.sha256(Path(__file__).read_bytes()).hexdigest() != receipt["adapter_sha256"]:
        raise Refused("source or release primitives changed since preparation")
    for key in ("gate_sha256", "probe_sha256"):
        read(module, "evidence", directory(module, "evidence") / (receipt[key] + ".json"))
    with module.PromotionLock():
        spec, deployment = snapshot(module)
        target_spec = replace_tag(spec, receipt["target"]["tag"])
        previous_spec = replace_tag(spec, receipt["previous"]["tag"])
        identity(module, receipt["target"])
        identity(module, receipt["previous"])
        if digest(previous_spec) != receipt["spec_sha256"]:
            raise Refused("shared app spec changed since preparation")
        current = docs_service(spec)["image"]["tag"]
        if current == receipt["target"]["tag"]:
            # A retry after success verifies serving state without another update.
            proof = probe_url("https://skysay.ai", receipt["source"]["sha"])
            proof["parity_sha256"] = parity(app_repo, "https://skysay.ai")
            final_fence(module, target_spec, deployment, receipt["target"])
            outcome = "already_live"
        elif current == receipt["previous"]["tag"] and deployment == receipt["deployment_id"]:
            try:
                update_spec(target_spec)
                deployment = await_spec(module, target_spec)
                identity(module, receipt["target"])
                proof = probe_url("https://skysay.ai", receipt["source"]["sha"])
                proof["parity_sha256"] = parity(app_repo, "https://skysay.ai")
                final_fence(module, target_spec, deployment, receipt["target"])
                outcome = "promoted"
            except Exception as failure:
                try:
                    data = module.app_data(APP_ID)
                    if digest(data.get("spec")) == digest(previous_spec) and not data.get("in_progress_deployment") and digest((data.get("active_deployment") or {}).get("spec")) == digest(previous_spec):
                        raise NotStarted("update failed before changing production") from failure
                    if digest(data.get("spec")) != digest(target_spec):
                        raise Refused("rollback refused after foreign spec change")
                    identity(module, receipt["previous"])
                    update_spec(previous_spec)
                    await_spec(module, previous_spec)
                    identity(module, receipt["previous"])
                    probe_url("https://skysay.ai")
                    _, restored_deployment = snapshot(module)
                    final_fence(module, previous_spec, restored_deployment, receipt["previous"])
                except Exception as rollback:
                    if isinstance(rollback, NotStarted):
                        raise rollback
                    raise RollbackFailed(f"docs rollback incomplete: {type(rollback).__name__}") from failure
                raise RolledBack(f"docs promotion failed and was rolled back: {type(failure).__name__}") from failure
        else:
            raise Refused("docs active deployment fence changed")
        result = {"receipt_sha256": digest(receipt), "outcome": outcome, "deployment_id": deployment, "proof": proof, "elapsed_seconds": round(time.monotonic() - started, 3), "completed_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        print(json.dumps({"outcome": outcome, "evidence": str(save(module, "promotions", result))}))


def promote(module, receipt, primitive_identity, app_repo):
    started = time.monotonic()
    try:
        _promote(module, receipt, primitive_identity, app_repo)
    except Exception as failure:
        outcome = "rollback_failed" if isinstance(failure, RollbackFailed) else "rolled_back" if isinstance(failure, RolledBack) else "not_started" if isinstance(failure, NotStarted) else "refused"
        result = {"receipt_sha256": digest(receipt), "outcome": outcome, "failure_class": type(failure).__name__, "reason": refusal(failure), "elapsed_seconds": round(time.monotonic() - started, 3), "completed_at": dt.datetime.now(dt.timezone.utc).isoformat()}
        try:
            evidence = str(save(module, "promotions", result))
        except Exception:
            evidence = None
        diagnostic({"outcome": outcome, "evidence": evidence, "reason": result["reason"]})
        raise


def refusal(failure):
    # Which proof refused. A rolled-back promotion names the proof that failed,
    # not the rollback; the class alone ("Refused") told the operator nothing
    # on 2026-09-14 and cost a burned tag to find out. Every Refused message is
    # adapter-authored -- a literal, an executable name, a status code or an
    # exception class -- so it can be printed and persisted; captured command
    # output never reaches one. Anything else is reported by class only.
    cause = failure.__cause__ if isinstance(failure, (RolledBack, RollbackFailed)) and failure.__cause__ is not None else failure
    return str(cause) if isinstance(cause, Refused) else type(cause).__name__


def diagnostic(value):
    # Output/storage trouble must never downgrade a rollback-failure exit code.
    try:
        print(json.dumps(value), file=sys.stderr)
    except OSError:
        pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("prepare", "promote"))
    parser.add_argument("--app-repo", type=Path, required=True)
    parser.add_argument("--receipt")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args(argv)
    try:
        module, primitive_identity = primitives(args.app_repo.resolve())
        if args.action == "prepare":
            if args.receipt or args.execute:
                raise Refused("prepare does not promote a receipt")
            with module.PromotionLock():
                prepare(module, primitive_identity, args.app_repo.resolve())
        else:
            if not args.receipt or not args.execute:
                raise Refused("promotion requires --receipt and --execute")
            promote(module, read(module, "receipts", args.receipt), primitive_identity, args.app_repo.resolve())
    except Exception as exc:
        diagnostic({"docs_release_failed": type(exc).__name__, "message": str(exc)})
        return 2 if isinstance(exc, RollbackFailed) else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
