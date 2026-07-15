#!/usr/bin/env python3
"""Optional Feishu tenant token helper for direct OpenAPI integrations.

Prefer lark-cli's credential store when it is available. This helper exists for
agents that call Feishu OpenAPI directly. Credentials are read from process
environment variables first, then from OfferLoop's user config directory. Tokens are
cached in a user-private cache file with mode 0600.
"""

from __future__ import annotations

import argparse
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Mapping


REPO_ROOT = Path(__file__).resolve().parents[1]
LEGACY_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_CACHE_FILE = (
    Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    / "offerloop"
    / "job-collection"
    / "feishu-token.json"
)
TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
EXPIRY_SAFETY_MARGIN_SEC = 10 * 60


class TokenError(RuntimeError):
    """Raised when credentials or the Feishu token response are invalid."""


def default_env_file(environ: Mapping[str, str] | None = None) -> Path:
    source = dict(os.environ if environ is None else environ)
    if source.get("OFFERLOOP_JOB_COLLECTION_ENV"):
        return Path(source["OFFERLOOP_JOB_COLLECTION_ENV"]).expanduser()
    config_home = Path(
        source.get("XDG_CONFIG_HOME", Path.home() / ".config")
    ).expanduser()
    return config_home / "offerloop" / "job-collection" / ".env"


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def load_credentials(
    environ: Mapping[str, str] | None = None, env_file: Path | None = None
) -> tuple[str, str]:
    source = dict(os.environ if environ is None else environ)
    selected = env_file or default_env_file(source)
    if env_file is None and not selected.exists() and LEGACY_ENV_FILE.exists():
        selected = LEGACY_ENV_FILE
    source.update(
        {
            key: value
            for key, value in load_env_file(selected).items()
            if key not in source
        }
    )
    app_id = source.get("FEISHU_APP_ID", "").strip()
    app_secret = source.get("FEISHU_APP_SECRET", "").strip()
    if not app_id or not app_secret:
        raise TokenError(
            "Missing FEISHU_APP_ID or FEISHU_APP_SECRET. Configure lark-cli or "
            f"set them in the process environment / {default_env_file(source)}."
        )
    return app_id, app_secret


def fetch_new_token(app_id: str, app_secret: str) -> tuple[str, int]:
    payload = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    request = urllib.request.Request(
        TOKEN_ENDPOINT,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise TokenError(f"Failed to request Feishu token: {exc}") from exc

    if result.get("code", 0) != 0 or not result.get("tenant_access_token"):
        raise TokenError(
            f"Feishu rejected the token request: code={result.get('code')} "
            f"msg={result.get('msg', 'unknown')}"
        )
    expires_in = int(result.get("expire", 7200))
    return result["tenant_access_token"], expires_in


def read_cached_token(cache_file: Path, now: float | None = None) -> str | None:
    if not cache_file.exists():
        return None
    try:
        data = json.loads(cache_file.read_text(encoding="utf-8"))
        if float(data["expires_at"]) > (now or time.time()):
            return str(data["token"])
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
    return None


def write_cached_token(cache_file: Path, token: str, expires_at: float) -> None:
    cache_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary_name = tempfile.mkstemp(prefix="token-", dir=cache_file.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"token": token, "expires_at": expires_at}, handle)
        os.replace(temporary_name, cache_file)
        os.chmod(cache_file, 0o600)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def get_token(
    *, env_file: Path | None = None, cache_file: Path | None = None
) -> str:
    cache_path = cache_file or Path(
        os.environ.get("JOB_COLLECTION_TOKEN_CACHE", DEFAULT_CACHE_FILE)
    )
    cached = read_cached_token(cache_path)
    if cached:
        return cached

    app_id, app_secret = load_credentials(env_file=env_file)
    token, expires_in = fetch_new_token(app_id, app_secret)
    usable_for = max(60, expires_in - EXPIRY_SAFETY_MARGIN_SEC)
    write_cached_token(cache_path, token, time.time() + usable_for)
    return token


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--print-token",
        action="store_true",
        help="Print the token to stdout. Avoid this in shared logs.",
    )
    args = parser.parse_args()
    token = get_token()
    print(token if args.print_token else "Feishu token is available.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
