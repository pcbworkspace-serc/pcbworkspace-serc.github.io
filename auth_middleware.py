"""
Auth middleware for the robot endpoints — shared-secret token.

The frontend stores VITE_ROBOT_TOKEN in its env and sends it as
`Authorization: Bearer <token>` on every request. The backend compares it
to the value in env var SERC_ROBOT_TOKEN.

Setup:
  1. Pick a strong random string (32+ chars). Generate one with:
       python -c "import secrets; print(secrets.token_urlsafe(32))"
  2. On the Flask host:
       export SERC_ROBOT_TOKEN="that-string"   (or  $env:SERC_ROBOT_TOKEN = "..." on Windows)
  3. In your Vite project's .env.local:
       VITE_ROBOT_TOKEN=that-same-string
  4. Restart Flask and `npm run dev` so both sides pick it up.

For local development without auth, set SERC_AUTH_DISABLED=1.

For MJPEG <img> streams that can't set headers, the middleware also
accepts the token via ?access_token=<token> in the URL.
"""
from __future__ import annotations

import hmac
import os
from functools import wraps
from typing import Callable

from flask import g, jsonify, request


_TOKEN = os.environ.get("SERC_ROBOT_TOKEN", "")
_DISABLED = os.environ.get("SERC_AUTH_DISABLED", "0") in ("1", "true", "yes")


def require_auth(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if _DISABLED:
            g.user_email = "dev@localhost"
            return fn(*args, **kwargs)

        if not _TOKEN:
            return jsonify({
                "ok": False,
                "error": "auth not configured: SERC_ROBOT_TOKEN unset on backend",
            }), 500

        token = ""
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[len("Bearer "):].strip()
        if not token:
            token = request.args.get("access_token", "").strip()
        if not token:
            return jsonify({"ok": False, "error": "auth required"}), 401

        # Constant-time compare to avoid timing-based token recovery.
        if not hmac.compare_digest(token, _TOKEN):
            return jsonify({"ok": False, "error": "invalid token"}), 401

        g.user_email = "authenticated"
        return fn(*args, **kwargs)
    return wrapper
