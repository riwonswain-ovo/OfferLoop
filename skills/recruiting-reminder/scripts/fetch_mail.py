#!/usr/bin/env python3
"""
Read recent emails from any IMAP mailbox and output JSON envelopes.

Originally written for NetEase 163/126 mailboxes, where the IMAP server
requires an `ID` command before it lets clients SELECT a mailbox. Without
`ID`, the server returns "Unsafe Login. Please contact kefu@188.com for
help" on SELECT even though LOGIN succeeded.

For other providers (Gmail, Outlook, QQ, Fastmail, …) the ID command is
harmless but unnecessary; we send it only when the imap host looks like a
NetEase domain (163.com / 126.com / yeah.net / 188.com).

Configuration is read from environment variables or OfferLoop's user config
directory. The default file is
`~/.config/offerloop/recruiting-reminder/.env` (or the equivalent
`XDG_CONFIG_HOME` location). A legacy `.env` next to this script is still
accepted for migration. No external dependencies are required.

    IMAP_HOST      imap.163.com
    IMAP_PORT      993
    IMAP_LOGIN     you@example.com
    IMAP_PASSWORD  app-specific password (NOT your login password —
                   most providers require an app password / authorization
                   code with IMAP/SMTP enabled)
    MAILBOX        INBOX   (optional, default INBOX)
    TZ             Asia/Shanghai  (optional, affects default time zone for
                                   date math; defaults to UTC)

Usage:
    python3 fetch_mail.py --days 7 --max 50
    python3 fetch_mail.py --days 7 --max 50 --with-body
    python3 fetch_mail.py --body <uid>

Outputs JSON to stdout: a list of envelopes, each with
uid / subject / from / date / body_preview (first 500 chars of text body).
The full message body can be fetched with --body <uid>.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from imaplib import IMAP4_SSL, Commands
from pathlib import Path


# Allow imaplib to issue the IMAP ID extension command.
Commands["ID"] = ("NONAUTH", "AUTH", "SELECTED")


# Hosts that require the NetEase-style ID command before SELECT.
NETEASE_DOMAINS = (
    "163.com",
    "126.com",
    "yeah.net",
    "188.com",
    "netease.com",
)


SCRIPT_DIR = Path(__file__).resolve().parent
LEGACY_ENV_FILE = SCRIPT_DIR / ".env"


def default_env_file(environ=None):
    """Return the update-safe OfferLoop IMAP config path."""
    source = dict(os.environ if environ is None else environ)
    if source.get("OFFERLOOP_IMAP_ENV"):
        return Path(source["OFFERLOOP_IMAP_ENV"]).expanduser()
    config_home = Path(
        source.get("XDG_CONFIG_HOME", Path.home() / ".config")
    ).expanduser()
    return config_home / "offerloop" / "recruiting-reminder" / ".env"


def parse_env_file(path):
    """Minimal .env parser. Supports KEY=VALUE, ignores blank lines and
    # comments, strips surrounding quotes. Good enough for local config;
    not a full dotenv implementation."""
    path = Path(path)
    if not path.exists():
        return {}
    out = {}
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip()
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            out[k] = v
    return out


def load_config(environ=None, env_file=None):
    """Load config with process values taking precedence over files.

    New installations use the user config directory so Skill updates cannot
    overwrite credentials. The Skill-local file remains a read-only fallback
    for existing users.
    """
    source = dict(os.environ if environ is None else environ)
    selected = Path(env_file) if env_file else default_env_file(source)
    if not selected.exists() and env_file is None and LEGACY_ENV_FILE.exists():
        selected = LEGACY_ENV_FILE
    cfg = parse_env_file(selected)
    for key in ("IMAP_HOST", "IMAP_PORT", "IMAP_LOGIN", "IMAP_PASSWORD", "MAILBOX", "TZ"):
        val = source.get(key)
        if val:
            cfg[key] = val
    return cfg


def get_local_tz():
    """Return the timezone to use for naive date math. Reads TZ env var
    (or .env TZ), falls back to UTC. Claude Code users in China typically
    set TZ=Asia/Shanghai."""
    tz_name = load_config().get("TZ")
    if not tz_name:
        return timezone.utc
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.utc


def is_netease(host):
    return host and any(d in host.lower() for d in NETEASE_DOMAINS)


def send_id(conn, email_addr):
    """Send the NetEase-required IMAP ID command. Harmless on servers
    that ignore it; required on 163/126 to unlock SELECT."""
    conn._simple_command(
        "ID",
        f'("name" "test-reminder" "version" "1.0" "vendor" "open-source" "support-email" "{email_addr}")',
    )
    conn._untagged_response("OK", [None], "ID")


def decode_mime_header(value):
    if not value:
        return value
    from email.header import decode_header, make_header
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def strip_html(html):
    """Crude HTML to text: remove tags + collapse whitespace. Only used
    as a fallback when no text/plain part exists."""
    text = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"&amp;", "&", text, flags=re.IGNORECASE)
    text = re.sub(r"&lt;", "<", text, flags=re.IGNORECASE)
    text = re.sub(r"&gt;", ">", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_envelope(uid, raw_headers, body_preview):
    envelope = {"uid": uid, "subject": None, "from": None, "date": None, "body_preview": body_preview}
    for line in raw_headers.split(b"\r\n"):
        if not line:
            continue
        try:
            decoded = line.decode("utf-8", errors="replace")
        except Exception:
            decoded = line.decode("latin-1", errors="replace")
        if decoded.lower().startswith("subject:"):
            envelope["subject"] = decode_mime_header(decoded[8:].strip())
        elif decoded.lower().startswith("from:"):
            envelope["from"] = decode_mime_header(decoded[5:].strip())
        elif decoded.lower().startswith("date:"):
            envelope["date"] = decoded[5:].strip()
    return envelope


def get_body_preview(conn, uid):
    typ, data = conn.uid("fetch", uid, "(RFC822)")
    if typ != "OK" or not data or not data[0]:
        return ""
    return extract_body(data)[:500]


def extract_body(data):
    """Extract text body from a UID fetch result. Prefer text/plain; fall
    back to text/html with tags stripped."""
    raw = data[0][1] if isinstance(data[0], tuple) else data[0]
    from email import message_from_bytes
    from email.policy import default as default_policy
    msg = message_from_bytes(raw, policy=default_policy)
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            cdisp = (part.get_content_disposition() or "").lower()
            if ctype == "text/plain" and cdisp != "attachment":
                body = part.get_content()
                break
        if not body:
            for part in msg.walk():
                ctype = part.get_content_type()
                cdisp = (part.get_content_disposition() or "").lower()
                if ctype == "text/html" and cdisp != "attachment":
                    body = strip_html(part.get_content())
                    break
    else:
        ctype = msg.get_content_type()
        content = msg.get_content()
        if ctype == "text/html":
            body = strip_html(content)
        else:
            body = content
    if isinstance(body, bytes):
        body = body.decode("utf-8", errors="replace")
    return body if body else ""


def imap_connect(host, port):
    return IMAP4_SSL(host, port)


def require(cfg, key):
    val = cfg.get(key)
    if not val:
        die(
            f"missing env var: {key}. Configure {default_env_file()} "
            "or set OFFERLOOP_IMAP_ENV to another .env file."
        )
    return val


def fetch_recent(opts):
    cfg = load_config()
    host = require(cfg, "IMAP_HOST")
    port = int(cfg.get("IMAP_PORT", "993"))
    login = require(cfg, "IMAP_LOGIN")
    password = require(cfg, "IMAP_PASSWORD")
    mailbox = cfg.get("MAILBOX", "INBOX")
    email_addr = login

    conn = imap_connect(host, port)
    try:
        conn.login(login, password)
        if is_netease(host):
            send_id(conn, email_addr)
        conn.select(mailbox)

        since_date = (datetime.now(timezone.utc) - timedelta(days=opts.days)).strftime("%d-%b-%Y")
        typ, data = conn.uid("search", None, f'(SINCE {since_date})')
        if typ != "OK":
            die(f"search failed: {data}")
        uids = data[0].split() if data and data[0] else []
        uids = uids[-opts.max:] if opts.max else uids

        envelopes = []
        for uid in uids:
            uid_s = uid.decode()
            typ, data = conn.uid("fetch", uid, "(BODY.PEEK[HEADER.FIELDS (SUBJECT FROM DATE)])")
            if typ != "OK" or not data or not data[0]:
                continue
            raw_headers = data[0][1] if isinstance(data[0], tuple) else b""
            body_preview = get_body_preview(conn, uid) if opts.with_body else ""
            envelopes.append(parse_envelope(uid_s, raw_headers, body_preview))
        return envelopes
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def fetch_body(uid):
    cfg = load_config()
    host = require(cfg, "IMAP_HOST")
    port = int(cfg.get("IMAP_PORT", "993"))
    login = require(cfg, "IMAP_LOGIN")
    password = require(cfg, "IMAP_PASSWORD")
    mailbox = cfg.get("MAILBOX", "INBOX")

    conn = imap_connect(host, port)
    try:
        conn.login(login, password)
        if is_netease(host):
            send_id(conn, login)
        conn.select(mailbox)
        typ, data = conn.uid("fetch", uid, "(RFC822)")
        if typ != "OK" or not data or not data[0]:
            return ""
        return extract_body(data)
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def die(msg, code=1):
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(code)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=7, help="look back N days")
    p.add_argument("--max", type=int, default=50, help="max envelopes to return")
    p.add_argument("--with-body", action="store_true", help="include 500-char body preview")
    p.add_argument("--body", metavar="UID", help="fetch full body of one message by UID")
    p.add_argument(
        "--env-file",
        help="path to an IMAP .env file (also available as OFFERLOOP_IMAP_ENV)",
    )
    args = p.parse_args()

    if args.env_file:
        os.environ["OFFERLOOP_IMAP_ENV"] = args.env_file

    if args.body:
        out = fetch_body(args.body)
        print(out)
        return

    envelopes = fetch_recent(args)
    print(json.dumps(envelopes, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
