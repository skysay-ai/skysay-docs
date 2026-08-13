#!/usr/bin/env python3
"""Replace the checked-in OpenAPI snapshot from a reviewed local schema export.

The command accepts a local JSON file or stdin. It deliberately never fetches a
live endpoint: reviewers should be able to reproduce docs output offline from
the exact API commit paired with this documentation change.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import TextIO


ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "api" / "openapi.json"


def _input_stream(value: str) -> TextIO:
    return sys.stdin if value == "-" else Path(value).open(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="source", required=True, help="reviewed local OpenAPI JSON path, or - for stdin")
    args = parser.parse_args(argv)
    with _input_stream(args.source) as stream:
        try:
            schema = json.load(stream)
        except json.JSONDecodeError as error:
            print(f"OPENAPI SNAPSHOT FAILED: invalid JSON: {error}", file=sys.stderr)
            return 1
    if not isinstance(schema, dict) or not isinstance(schema.get("paths"), dict):
        print("OPENAPI SNAPSHOT FAILED: source must be an OpenAPI object with paths", file=sys.stderr)
        return 1
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote {DESTINATION.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
