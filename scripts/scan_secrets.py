#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Secret scanner for the openphonex-docs public repository.

Stdlib only, offline, Python 3.11+. Adapted from the Skysay OSS-release
scanner. It runs in CI on every push and pull request and fails the build
(non-zero exit) on any un-allowlisted finding, so "the docs tree is clean" is
enforced rather than assumed.

Every under-size, non-binary file is scanned regardless of extension — a file
that CANNOT be scanned (oversized, undecodable binary) produces an
`unscanned-*` finding rather than being silently skipped, so a secret cannot
slip through in a .csv/.svg/.xml/.log file.

Rules:
  * PEM / OpenSSH / PGP private-key headers
  * AWS access key ids (AKIA...)
  * Skysay tokens: sky_/tai_/tapi_<24+> (org key), skygw_/tgw_<24+> (gateway token)
  * OpenAI keys (sk-<20+>), Google/Gemini keys (AIza<35>), ElevenLabs (sk_<hex>)
  * GitHub tokens (gh[pousr]_<36+>), Slack tokens (xox[baprs]-...)
  * generic `password/secret/api_key/token = <high-entropy literal>`
  * env identifiers ending in a secret suffix holding a filled value
  * Shannon-entropy check on long standalone base64 tokens
  * routable IPv4 literals in config-like files
  * dialable phone numbers in E.164 form — the highest-risk leak for a
    telephony docs repo is a real, billable DID pasted into a page. Numbers in
    the ranges reserved for documentation (NANP 555-01xx, UK 07700 900xxx,
    Ofcom drama ranges) and obvious placeholders are allowed.
  * presence of .env / *.pem / *.key / *.p12 / *.pfx files

DERIVATIVE — DO NOT SYNC THE UPSTREAM VERSION OVER THIS FILE.

This is a deliberately reduced fork of Skysay's internal OSS-release
scanner. The upstream version carries a blocklist of *specific* internal
infrastructure IPs and owned, callable, billable test DIDs as literal constants.
Those literals cannot exist in a public repository: committing the blocklist
would publish the exact values it is meant to guard, permanently, in git
history — inside the very file whose job is to prevent that.

So the blocklist is omitted here on purpose, and the generic
`dialable-phone-number` rule below enforces the same property without naming
anything. If you are tempted to "restore parity" by copying the internal
scanner into this repository: don't. The internal repository keeps its own
scanner as its own gate, and this one is not a replacement for it.

Usage:
  scan_secrets.py <path> [<path> ...] [--allow FILE] [--json]
  scan_secrets.py --self-test
"""
from __future__ import annotations

import argparse
import fnmatch
import ipaddress
import json
import math
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

# --------------------------------------------------------------------------- #
# Allowlisting
# --------------------------------------------------------------------------- #

# ${VAR} or $VAR — treated as a placeholder, never a secret.
ENV_REF = re.compile(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*")

# Case-insensitive substrings that mark a value as an obvious placeholder.
PLACEHOLDER_SUBSTRINGS = (
    "changeme",
    "change-me",
    "<set-secret>",
    "set-secret",
    "your-",
    "your_",
    "example",
    "placeholder",
    "redacted",
    "dummy",
    "sample",
    "todo",
    "xxxx",
    "replace",
    "test",
    "fake",
    "mock",
    "stub",
    "notreal",
    "not-a-secret",
    "<",  # any angle-bracket template like <token>
)

PLACEHOLDER_TOKENS = frozenset(
    {"sky_...", "skygw_...", "tai_...", "tapi_...", "tgw_...", "gw_...", "sk-...",
     "sky_", "skygw_", "tai_", "tapi_", "tgw_"}
)


def _is_placeholder(value: str) -> bool:
    v = value.strip().strip("'\"")
    if not v:
        return True
    if v in PLACEHOLDER_TOKENS:
        return True
    low = v.lower()
    if any(sub in low for sub in PLACEHOLDER_SUBSTRINGS):
        return True
    if ENV_REF.sub("", v).strip() == "":
        return True
    return False


def shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    counts: dict[str, int] = {}
    for ch in s:
        counts[ch] = counts.get(ch, 0) + 1
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


# --------------------------------------------------------------------------- #
# Public-IP handling (scoped to config-like files)
# --------------------------------------------------------------------------- #

_ALLOWED_NETS = [
    ipaddress.ip_network(n)
    for n in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",  # CGNAT
        "127.0.0.0/8",
        "169.254.0.0/16",  # link-local
        "172.16.0.0/12",
        "192.0.2.0/24",  # TEST-NET-1 (documentation)
        "192.168.0.0/16",
        "198.51.100.0/24",  # TEST-NET-2
        "203.0.113.0/24",  # TEST-NET-3
        "224.0.0.0/4",  # multicast
        "240.0.0.0/4",  # reserved
        "255.255.255.255/32",
    )
]

_IPV4_RE = re.compile(r"(?<![\w.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?![\w.])")


def _is_public_ipv4(token: str) -> bool:
    try:
        ip = ipaddress.ip_address(token)
    except ValueError:
        return False
    if ip.version != 4:
        return False
    return not any(ip in net for net in _ALLOWED_NETS)


# --------------------------------------------------------------------------- #
# Dialable-number handling
# --------------------------------------------------------------------------- #

# E.164-ish: a leading `+` followed by 8-15 digits, allowing the usual visual
# separators between them. Anything shorter is not dialable internationally.
_PHONE_RE = re.compile(r"(?<![\w+])\+\d[\d  ().\-‐-―−]{6,22}\d")

# Ranges reserved by regulators for documentation and drama, plus structural
# placeholders. A number matching any of these is safe to publish.
_PHONE_ALLOW_PREFIXES = (
    "447700900",  # UK Ofcom drama mobile range 07700 900000-900999
    "441632960",  # UK Ofcom drama landline range 01632 960000-960999
    "4915123456789",  # ITU/E.164 example
)


def _phone_is_placeholder(digits: str) -> bool:
    """True when the digit run is a documented fictitious/structural number."""
    if any(digits.startswith(p) for p in _PHONE_ALLOW_PREFIXES):
        return True
    # Repeated or sequential filler: +10000000000, +11111111111, +1234567890.
    if len(set(digits)) <= 2:
        return True
    if digits in "01234567890123456789" or digits in "98765432109876543210":
        return True
    # North American Numbering Plan: 555 is never assignable, either as the area
    # code (impossible) or as the central-office code (reserved for fiction,
    # 555-0100..555-0199 formally). Accept the number with or without the `1`.
    nanp = digits[1:] if digits.startswith("1") else digits
    if nanp.startswith("555"):
        return True
    if len(nanp) == 10 and nanp[3:6] == "555":
        return True
    return False


# --------------------------------------------------------------------------- #
# Rules
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern
    next_step: str
    # A "signature" rule matches a specific provider shape (a fixed prefix +
    # charset). For these the MATCH IS the finding: fuzzy placeholder
    # suppression must NOT apply, or a real credential whose random body
    # happens to contain "test"/"fake" would be silently dropped.
    signature: bool = True


_TOKEN_RULES = [
    Rule(
        "private-key",
        re.compile(r"-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"),
        "Remove the private key material; it must never be committed.",
    ),
    Rule(
        "aws-access-key-id",
        re.compile(r"(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])"),
        "Rotate the AWS key and move it to a secret store / env var.",
    ),
    Rule(
        "skysay-org-token",
        # Org API keys are minted as `sky_`; `tai_`/`tapi_` are the prior
        # generations, still valid since verification is by hash. The body is
        # base64url, so `-`/`_` are part of the token.
        re.compile(r"(?<![A-Za-z0-9_-])(?:sky|tai|tapi)_[A-Za-z0-9_-]{24,}"),
        "This is a live org API key (sky_/tai_/tapi_). Rotate it; docs must use sky_... placeholders.",
    ),
    Rule(
        "skysay-gateway-token",
        re.compile(r"(?<![A-Za-z0-9_-])(?:skygw|tgw)_[A-Za-z0-9_-]{24,}"),
        "Live per-gateway token (skygw_/tgw_). Rotate it and use a placeholder.",
    ),
    Rule(
        "openai-key",
        re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9]{20,}"),
        "Rotate the OpenAI key; reference it via env var only.",
    ),
    Rule(
        "google-gemini-key",
        re.compile(r"(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_\-]{35}(?![0-9A-Za-z_\-])"),
        "Rotate the Google/Gemini key; reference it via env var only.",
    ),
    Rule(
        "elevenlabs-key",
        re.compile(r"(?<![A-Za-z0-9_])sk_[a-f0-9]{40,}"),
        "Rotate the ElevenLabs key; reference it via env var only.",
    ),
    Rule(
        "github-token",
        re.compile(r"(?<![A-Za-z0-9_])gh[pousr]_[A-Za-z0-9]{36,}"),
        "Rotate the GitHub token immediately; it grants repository access.",
    ),
    Rule(
        "slack-token",
        re.compile(r"(?<![A-Za-z0-9_])xox[baprs]-[A-Za-z0-9-]{10,}"),
        "Rotate the Slack token; it must never be committed.",
    ),
]

_SECRET_KW = r"\b(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|token)\b"
_ASSIGN_RE = re.compile(
    _SECRET_KW + r"\s*[:=]\s*(?P<qval>\"[^\"]*\"|'[^']*')"
    r"|" + _SECRET_KW + r"\s*[:=]\s*(?P<uval>[^\s#;,'\"]+)",
    re.IGNORECASE,
)

# Env-var identifiers ENDING in an unambiguous secret suffix. `_ASSIGN_RE`
# misses these because `\bsecret\b` needs a word boundary that a `_` prefix
# (LIVEKIT_API_SECRET) does not provide. KEY is deliberately EXCLUDED (public
# ids like LIVEKIT_API_KEY end in KEY).
_ENV_SECRET_RE = re.compile(
    r"(?<![A-Za-z0-9_])[A-Za-z][A-Za-z0-9_]*(?:secret|password|passwd|passphrase|pass|token)"
    r"\s*[:=]\s*(?P<val>\"[^\"]*\"|'[^']*'|[^\s#;,]+)",
    re.IGNORECASE,
)

_CONFIG_LIKE_SUFFIXES = {".conf", ".template", ".ini", ".cfg", ".properties", ".yaml", ".yml"}

# Long standalone token for the entropy check: the STANDARD base64 alphabet.
_ENTROPY_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{40,}={0,2}(?![A-Za-z0-9+/])")

# `sha512-`/`sha256-`/`sha1-` immediately before a base64 run marks a
# Subresource-Integrity digest (npm lockfiles, <script integrity="...">).
_SRI_PREFIX_RE = re.compile(r"sha(?:1|256|384|512)-$")

_ENTROPY_THRESHOLD = 4.3
_ASSIGN_ENTROPY_THRESHOLD = 3.0

_DANGEROUS_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".pkcs12", ".jks")
_SKIP_DIRS = {
    ".git",
    "__pycache__",
    "node_modules",
    ".venv",
    ".next",
    ".source",
    ".mypy_cache",
    ".pytest_cache",
}
_IP_SCOPE_SUFFIXES = {".conf", ".template", ".yaml", ".yml", ".ini", ".cfg"}
_MAX_BYTES = 2_000_000

# Characters that only FORMAT a phone number, stripped before matching.
_PHONE_FORMAT_CHARS = frozenset(" \t -.()")
_UNICODE_DASHES = frozenset("−﹘﹣－‐‑‒–—")


def _phone_digits(match: str) -> str:
    out = []
    for ch in unicodedata.normalize("NFKC", match):
        value = unicodedata.decimal(ch, None)
        if value is not None:
            out.append(str(value))
    return "".join(out)


@dataclass
class Finding:
    path: str
    line: int
    rule: str
    match: str
    next_step: str

    def redacted(self) -> str:
        m = self.match
        if len(m) <= 8:
            return m[0:2] + "***"
        return m[:4] + "***" + m[-2:]

    def render(self) -> str:
        return f"{self.path}:{self.line} {self.rule} {self.redacted()} :: {self.next_step}"


# --------------------------------------------------------------------------- #
# Allowlist file
# --------------------------------------------------------------------------- #


@dataclass
class AllowList:
    # list of (path_glob, rule_glob, why)
    entries: list[tuple[str, str, str]] = field(default_factory=list)

    def covers(self, path: str, rule: str) -> bool:
        for pg, rg, _why in self.entries:
            if fnmatch.fnmatch(path, pg) and fnmatch.fnmatch(rule, rg):
                return True
        return False

    @classmethod
    def load(cls, path: Path | None) -> "AllowList":
        entries: list[tuple[str, str, str]] = []
        if path and path.is_file():
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(None, 2)
                if len(parts) < 2:
                    continue
                entries.append((parts[0], parts[1], parts[2] if len(parts) > 2 else ""))
        return cls(entries=entries)


# --------------------------------------------------------------------------- #
# Scanning
# --------------------------------------------------------------------------- #


def _looks_like_secret_value(val: str) -> bool:
    """A non-placeholder, non-trivial, high-entropy literal (not a URL/bool)."""
    if _is_placeholder(val):
        return False
    if len(val) < 8:
        return False
    if val.lower() in {"true", "false", "none", "null", "0", "1"}:
        return False
    if "://" in val:
        return False
    return shannon_entropy(val) >= _ASSIGN_ENTROPY_THRESHOLD


def scan_text(rel_path: str, text: str, suffix: str) -> list[Finding]:
    findings: list[Finding] = []
    lines = text.splitlines()
    name = Path(rel_path).name
    ip_scoped = suffix in _IP_SCOPE_SUFFIXES or rel_path.endswith(".conf.template") or ".env" in name
    config_like = suffix in _CONFIG_LIKE_SUFFIXES or ".env" in name

    for i, line in enumerate(lines, start=1):
        # Token rules. Signature rules are NEVER placeholder-suppressed.
        for rule in _TOKEN_RULES:
            for m in rule.pattern.finditer(line):
                token = m.group(0)
                if not rule.signature and _is_placeholder(token):
                    continue
                findings.append(Finding(rel_path, i, rule.name, token, rule.next_step))

        # Secret assignment
        for m in _ASSIGN_RE.finditer(line):
            qval = m.group("qval")
            uval = m.group("uval")
            if qval is not None:
                val = qval.strip().strip("'\"")
            else:
                # In code/prose an unquoted value is an expression, not a literal.
                if not config_like:
                    continue
                val = (uval or "").strip()
            if not _looks_like_secret_value(val):
                continue
            findings.append(
                Finding(
                    rel_path,
                    i,
                    "secret-assignment",
                    val,
                    "Move this credential to an env var / secret store; commit a ${ENV} placeholder.",
                )
            )

        # Prefixed secret identifiers (*_SECRET=, *_TOKEN=, *_PASSWORD=).
        for m in _ENV_SECRET_RE.finditer(line):
            raw = m.group("val")
            quoted = raw[:1] in ("\"", "'")
            val = raw.strip().strip("'\"") if quoted else raw.strip()
            if not quoted and not config_like:
                continue
            if not _looks_like_secret_value(val):
                continue
            findings.append(
                Finding(
                    rel_path,
                    i,
                    "env-secret-assignment",
                    val,
                    "This var is named a secret (*_SECRET/_TOKEN/_PASSWORD) but holds a filled value.",
                )
            )

        # Entropy check on long standalone tokens
        for m in _ENTROPY_TOKEN_RE.finditer(line):
            token = m.group(0)
            if _is_placeholder(token):
                continue
            if re.fullmatch(r"[A-Z0-9_]+", token):  # SCREAMING_SNAKE constant name
                continue
            # Subresource-Integrity digests (`sha512-<base64>`) are public
            # checksums, not credentials, and a lockfile is thousands of them.
            # Suppress them structurally by their prefix rather than
            # allowlisting whole files, so a real secret in package-lock.json
            # would still be reported.
            if _SRI_PREFIX_RE.search(line[: m.start()]):
                continue
            if shannon_entropy(token) >= _ENTROPY_THRESHOLD:
                findings.append(
                    Finding(
                        rel_path,
                        i,
                        "high-entropy-token",
                        token,
                        "Looks like a credential/high-entropy secret; remove or use an env var.",
                    )
                )

        # Dialable phone numbers in E.164 form.
        for m in _PHONE_RE.finditer(line):
            digits = _phone_digits(m.group(0))
            if not (8 <= len(digits) <= 15):
                continue
            if _phone_is_placeholder(digits):
                continue
            findings.append(
                Finding(
                    rel_path,
                    i,
                    "dialable-phone-number",
                    m.group(0).strip(),
                    "Real phone numbers are callable and billable. Use a reserved range "
                    "(+1 555 01xx) or a placeholder like +15550100.",
                )
            )

        # Public IPv4 (scoped to config-like files)
        if ip_scoped:
            for m in _IPV4_RE.finditer(line):
                ip = m.group(1)
                if _is_public_ipv4(ip):
                    findings.append(
                        Finding(
                            rel_path,
                            i,
                            "public-ipv4",
                            ip,
                            "Replace the routable IP with a ${ENV} reference.",
                        )
                    )
    return findings


def _dangerous_name(name: str) -> bool:
    lower = name.lower()
    if any(lower.endswith(sfx) for sfx in _DANGEROUS_SUFFIXES):
        return True
    if lower == ".env" or (
        lower.startswith(".env.") and not lower.endswith((".example", ".sample", ".template"))
    ):
        return True
    return False


def iter_files(root: Path):
    if root.is_file():
        yield root
        return
    for p in sorted(root.rglob("*")):
        if p.is_dir():
            continue
        if any(part in _SKIP_DIRS for part in p.parts):
            continue
        yield p


def scan(root: Path, allow: AllowList, base: Path | None = None) -> list[Finding]:
    findings: list[Finding] = []
    base = base or (root if root.is_dir() else root.parent)
    for p in iter_files(root):
        try:
            rel = str(p.relative_to(base))
        except ValueError:
            rel = str(p)
        if _dangerous_name(p.name):
            findings.append(
                Finding(
                    rel,
                    0,
                    "dangerous-file",
                    p.name,
                    "Do not commit secret-bearing files (.env/.pem/.key/.p12).",
                )
            )
        suffix = p.suffix.lower()
        try:
            data = p.read_bytes()
        except OSError as exc:
            findings.append(
                Finding(rel, 0, "unscanned-file", p.name, f"Could not read the file to scan it ({exc}).")
            )
            continue
        # Fail-closed: a file we CANNOT scan is reported, never silently skipped.
        if len(data) > _MAX_BYTES:
            findings.append(
                Finding(
                    rel,
                    0,
                    "unscanned-oversized",
                    f"{len(data)} bytes",
                    "File exceeds the scan size limit and could hide a secret; allowlist if non-secret.",
                )
            )
            continue
        text: str | None = None
        if b"\x00" in data[:4096]:
            for enc in ("utf-16", "utf-16-le", "utf-16-be"):
                try:
                    candidate = data.decode(enc)
                except (UnicodeDecodeError, UnicodeError, ValueError):
                    continue
                if "\x00" not in candidate:
                    text = candidate
                    break
            if text is None:
                findings.append(
                    Finding(
                        rel,
                        0,
                        "unscanned-binary",
                        p.name,
                        "Binary/undecodable file could hide a secret; allowlist if non-secret.",
                    )
                )
                continue
        else:
            text = data.decode("utf-8", errors="replace")
        findings.extend(scan_text(rel, text, suffix))

    return [f for f in findings if not allow.covers(f.path, f.rule)]


# --------------------------------------------------------------------------- #
# Self-test
# --------------------------------------------------------------------------- #

# Fixture tokens are ASSEMBLED at runtime so no complete provider-token literal
# is committed to source. None of these are real secrets.
_POSITIVE_FIXTURES = {
    "planted_aws.txt": "aws_key = " + "AKIA" + "1234567890ABCDEF" + "\n",
    "planted_pem.txt": "-----BEGIN RSA " + "PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\n",
    "planted_gateway_token.env": "SKYSAY_GATEWAY_API_TOKEN=" + "tgw_" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "\n",
    "planted_org_token.env": "SKYSAY_WORKER_API_TOKEN=" + "tai_" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "\n",
    "planted_gateway_urlsafe.env": "SKYSAY_GATEWAY_API_TOKEN=" + "tgw_" + "A1b2-C3d4_E5f6-G7h8_I9j0K1" + "\n",
    "planted_org_urlsafe.env": "SKYSAY_WORKER_API_TOKEN=" + "tapi_" + "aa-bb_cc-dd_ee-ff_gg-hh_ii1" + "\n",
    "planted_gateway_token_sky.env": "SKYSAY_GATEWAY_API_TOKEN=" + "skygw_" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "\n",
    "planted_org_token_sky.env": "SKYSAY_WORKER_API_TOKEN=" + "sky_" + "A1b2C3d4E5f6G7h8I9j0K1l2" + "\n",
    "planted_sip.conf": "password=" + "Zx4Qw9Rt2Yu7Bn3Kp" + "\nmatch=8.8.8.8\n",
    "planted_openai.txt": "key: " + "sk-" + "ABCDEFGHIJKLMNOPQRSTUV12" + "\n",
    "planted_github.txt": "token " + "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8" + "\n",
    "secret.pem": "not even key material but a dangerous name\n",
    # A real-shaped dialable number in prose must be caught even though the file
    # is markdown and contains no credential keyword. These two are structurally
    # undialable (NANP area codes cannot begin with 1) so the fixture itself
    # cannot ring anyone, but they are outside every reserved range and so must
    # still trip the rule.
    "planted_did.md": "dial " + "+1 100 " + "926 4471" + " to reach the demo agent\n",
    "planted_did_ee.md": "originate " + "+372 " + "0000 0001" + " --dry-run\n",
}

_NEGATIVE_FIXTURES = {
    "ok_env_ref.conf": "password=${SIP_PASSWORD}\nusername=${SIP_TRUNK_USERNAME}\n",
    "ok_placeholder.md": "Use `tai_...` as your key, or `<your-api-key>`.\n",
    "ok_placeholder_sky.md": "Use `sky_...` as your key, or `skygw_...` as your gateway token.\n",
    "ok_private_ip.conf": "bind=10.0.0.4\nadvertise=127.0.0.1\ndocs=203.0.113.9\n",
    # Reserved-for-documentation numbers and structural placeholders.
    "ok_reserved_did.md": "Call +1 555 0100 or +1 (555) 010-0142 in examples.\n",
    "ok_uk_drama_did.md": "Ring +44 7700 900123 for the drama-range example.\n",
    "ok_filler_did.md": "Placeholder DID: +1 555 123 0000 and +10000000000.\n",
    # A git SHA and a sha256 digest must not trip the entropy rule.
    "ok_hashes.txt": "sha 9f2c1a4b8e7d6c5b4a39281706f5e4d3c2b1a09f\n",
    # An SRI integrity digest is a public checksum, not a credential. The
    # base64 body is split below the 40-char entropy threshold so the fixture
    # does not trip the scanner when the scanner scans itself.
    "ok_integrity.json": '  "integrity": "sha512-'
    + "Xz4TqQw9RtYuBnKpLmVcDfGhJkNpQrStUvWx"
    + "YzAbCdEfGhIjKlMnOpQrStUvWxYz12345678"
    + '=="\n',
    "ok_prose.mdx": "Set `SKYSAY_API_KEY` in your environment before running.\n",
}


def _self_test() -> int:
    import tempfile

    failures: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for name, body in {**_POSITIVE_FIXTURES, **_NEGATIVE_FIXTURES}.items():
            (root / name).write_text(body, encoding="utf-8")
        findings = scan(root, AllowList())
        by_path: dict[str, list[Finding]] = {}
        for f in findings:
            by_path.setdefault(f.path, []).append(f)

        for name in _POSITIVE_FIXTURES:
            if name not in by_path:
                failures.append(f"MISSED  {name} (expected at least one finding)")
        for name in _NEGATIVE_FIXTURES:
            if name in by_path:
                rules = ", ".join(sorted({f.rule for f in by_path[name]}))
                failures.append(f"FALSE+  {name} ({rules})")

        expected_rules = {
            "private-key",
            "aws-access-key-id",
            "skysay-org-token",
            "skysay-gateway-token",
            "openai-key",
            "github-token",
            "secret-assignment",
            "dangerous-file",
            "dialable-phone-number",
        }
        seen = {f.rule for f in findings}
        for rule in sorted(expected_rules - seen):
            failures.append(f"RULE    {rule} never fired")

    if failures:
        print("self-test FAILED:")
        for line in failures:
            print("  " + line)
        return 1
    print(f"self-test OK ({len(_POSITIVE_FIXTURES)} positive, {len(_NEGATIVE_FIXTURES)} negative fixtures)")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", help="files or directories to scan")
    parser.add_argument("--allow", help="path to a .secretsallow file (path<TAB>rule<TAB>why)")
    parser.add_argument("--json", action="store_true", help="emit findings as JSON")
    parser.add_argument("--self-test", action="store_true", help="run the built-in fixtures")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not args.paths:
        parser.error("at least one path is required (or --self-test)")

    repo_root = Path(__file__).resolve().parent.parent
    allow_path = Path(args.allow) if args.allow else repo_root / ".secretsallow"
    allow = AllowList.load(allow_path)

    findings: list[Finding] = []
    for raw in args.paths:
        target = Path(raw).resolve()
        if not target.exists():
            print(f"error: no such path: {raw}", file=sys.stderr)
            return 2
        findings.extend(scan(target, allow, base=repo_root))

    if args.json:
        print(
            json.dumps(
                [
                    {"path": f.path, "line": f.line, "rule": f.rule, "match": f.redacted(), "next_step": f.next_step}
                    for f in findings
                ],
                indent=2,
            )
        )
    else:
        for f in findings:
            print(f.render())

    if findings:
        print(f"\nFAILED: {len(findings)} finding(s).", file=sys.stderr)
        return 1
    print(f"clean: scanned {', '.join(args.paths)} — no findings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
