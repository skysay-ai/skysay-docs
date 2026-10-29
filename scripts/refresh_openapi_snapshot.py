#!/usr/bin/env python3
"""Refresh the OpenAPI snapshot, its coverage list and the generated API reference.

This is the one writer of ``api/openapi.json``,
``api/customer-api-coverage.json`` and ``content/docs/api-reference.mdx``: the
page is derived from the other two, so they are only ever written together.
From the application checkout at the released commit:

    PYTHONPATH=src:packages/skysay-common:packages/skysay-gateway \\
      .venv/bin/python scripts/export_openapi.py \\
      | python3 <docs>/scripts/refresh_openapi_snapshot.py --from - \\
          --coverage docs/public-api-coverage.json

The command accepts a local JSON file or stdin. It deliberately never fetches a
live endpoint: reviewers should be able to reproduce docs output offline from
the exact API commit paired with this documentation change.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import TextIO


def _load_generator() -> ModuleType:
    path = Path(__file__).resolve().with_name("generate_openapi_reference.py")
    spec = importlib.util.spec_from_file_location("skysay_api_reference", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = _load_generator()
ROOT = generator.ROOT
DESTINATION = generator.SNAPSHOT_PATH


class SnapshotError(ValueError):
    """Raised when the inputs cannot form a snapshot and a current page."""


def _input_stream(value: str) -> TextIO:
    return sys.stdin if value == "-" else Path(value).open(encoding="utf-8")


def refresh(
    schema: object,
    coverage_text: str,
    *,
    snapshot_path: Path = generator.SNAPSHOT_PATH,
    coverage_path: Path = generator.COVERAGE_PATH,
    output_path: Path = generator.OUTPUT_PATH,
) -> list[Path]:
    """Write the snapshot, the coverage list and the page.

    The page is rendered before any file is written, so inputs that cannot
    form a page (a coverage entry absent from the snapshot, a missing required
    operation) leave the checkout exactly as it was. A failed write is not
    rolled back: the command exits non-zero and the CI check fails the page.
    """
    if not isinstance(schema, dict) or not isinstance(schema.get("paths"), dict):
        raise SnapshotError("source must be an OpenAPI object with paths")
    try:
        coverage = json.loads(coverage_text)
    except json.JSONDecodeError as error:
        raise SnapshotError(f"invalid coverage JSON: {error}") from error
    if not isinstance(coverage, dict):
        raise SnapshotError("coverage must contain a JSON object")
    try:
        page = generator.render(schema, coverage)
    except generator.ReferenceError as error:
        raise SnapshotError(str(error)) from error
    snapshot_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_path.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    # Byte for byte what the application checks in, as the old `cp` did.
    coverage_path.write_text(coverage_text, encoding="utf-8")
    output_path.write_text(page, encoding="utf-8")
    return [snapshot_path, coverage_path, output_path]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="source", required=True, help="reviewed local OpenAPI JSON path, or - for stdin")
    parser.add_argument(
        "--coverage",
        required=True,
        help="the application's docs/public-api-coverage.json from the same commit",
    )
    args = parser.parse_args(argv)
    with _input_stream(args.source) as stream:
        try:
            schema = json.load(stream)
        except json.JSONDecodeError as error:
            print(f"OPENAPI SNAPSHOT FAILED: invalid JSON: {error}", file=sys.stderr)
            return 1
    try:
        coverage_text = Path(args.coverage).read_text(encoding="utf-8")
        written = refresh(schema, coverage_text)
    except (OSError, SnapshotError) as error:
        print(f"OPENAPI SNAPSHOT FAILED: {error}", file=sys.stderr)
        return 1
    for path in written:
        print(f"Wrote {path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
