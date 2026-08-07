#!/usr/bin/env python3
"""Brisa Bay site server + Instagram moments API.

Serves the static site and exposes:
  GET /api/instagram/moments?limit=10

Credentials (optional — falls back to local gallery images if missing):
  INSTAGRAM_USER_ID       Instagram professional account ID
  INSTAGRAM_ACCESS_TOKEN  Long-lived access token
  INSTAGRAM_GRAPH_HOST    graph.instagram.com (default) or graph.facebook.com
  INSTAGRAM_API_VERSION   e.g. v21.0 (default)
  PORT                    default 8080
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_TTL_SEC = int(os.environ.get("INSTAGRAM_CACHE_TTL", "900"))
DEFAULT_LIMIT = 10

FALLBACK_MOMENTS = [
    {
        "id": "local-1",
        "src": "assets/web2/story-photo.jpg",
        "alt": "Friends on a beach blanket pouring Brisa Bay Chardonnay",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-2",
        "src": "assets/web2/collage-a.jpg",
        "alt": "Friends clinking glasses of Brisa Bay over a picnic blanket",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-3",
        "src": "assets/web2/collage-b.jpg",
        "alt": "A table set with Brisa Bay bottles, white wine and small plates",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-4",
        "src": "assets/web2/collage-c.jpg",
        "alt": "A pool float afternoon with a bottle of Brisa Bay Sauvignon Blanc",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-5",
        "src": "assets/web2/better-together.jpg",
        "alt": "Sharing Brisa Bay together outdoors",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-6",
        "src": "assets/web2/every-occasion.jpg",
        "alt": "Brisa Bay for an easy, unplanned occasion",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-7",
        "src": "assets/web2/freshness-first.jpg",
        "alt": "Chilled bottles of Brisa Bay held up against a blue sky",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-8",
        "src": "assets/web2/intro-photo.jpg",
        "alt": "An afternoon pour of Brisa Bay in the sun",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-9",
        "src": "assets/web2/keeping-simple.jpg",
        "alt": "Keeping it simple with Brisa Bay",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
    {
        "id": "local-10",
        "src": "assets/web2/vibe-chardonnay.jpg",
        "alt": "Brisa Bay Chardonnay chilling by the pool",
        "permalink": "https://www.instagram.com/brisabaywines",
    },
]

_cache_lock = threading.Lock()
_cache: dict = {"at": 0.0, "payload": None}


def _load_dotenv() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _configured() -> bool:
    return bool(os.environ.get("INSTAGRAM_USER_ID") and os.environ.get("INSTAGRAM_ACCESS_TOKEN"))


def _caption_alt(caption: str | None) -> str:
    if not caption:
        return "A Bottled Moment from @brisabaywines on Instagram"
    one_line = " ".join(caption.split())
    return one_line[:140] + ("…" if len(one_line) > 140 else "")


def _normalize_media(item: dict) -> dict | None:
    media_type = (item.get("media_type") or "").upper()
    src = item.get("media_url") or item.get("thumbnail_url")
    if media_type == "VIDEO":
        src = item.get("thumbnail_url") or item.get("media_url")
    if media_type == "CAROUSEL_ALBUM":
        src = item.get("media_url") or item.get("thumbnail_url")
        children = (item.get("children") or {}).get("data") or []
        if not src and children:
            first = children[0]
            src = first.get("media_url") or first.get("thumbnail_url")
    if not src:
        return None
    return {
        "id": item.get("id") or src,
        "src": src,
        "alt": _caption_alt(item.get("caption")),
        "permalink": item.get("permalink") or "https://www.instagram.com/brisabaywines",
        "mediaType": media_type or "IMAGE",
        "timestamp": item.get("timestamp"),
    }


def _fetch_instagram(limit: int) -> list[dict]:
    user_id = os.environ["INSTAGRAM_USER_ID"].strip()
    token = os.environ["INSTAGRAM_ACCESS_TOKEN"].strip()
    host = os.environ.get("INSTAGRAM_GRAPH_HOST", "graph.instagram.com").strip()
    version = os.environ.get("INSTAGRAM_API_VERSION", "v21.0").strip()
    fields = (
        "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,"
        "children{media_type,media_url,thumbnail_url}"
    )
    query = urllib.parse.urlencode(
        {
            "fields": fields,
            "limit": max(limit * 2, limit),
            "access_token": token,
        }
    )
    url = f"https://{host}/{version}/{user_id}/media?{query}"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "BrisaBayMoments/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    moments: list[dict] = []
    for item in payload.get("data") or []:
        normalized = _normalize_media(item)
        if normalized:
            moments.append(normalized)
        if len(moments) >= limit:
            break
    if not moments:
        raise RuntimeError("Instagram returned no displayable media")
    return moments


def get_moments(limit: int = DEFAULT_LIMIT) -> dict:
    limit = max(1, min(int(limit or DEFAULT_LIMIT), 25))
    now = time.time()

    with _cache_lock:
        cached = _cache["payload"]
        if cached and now - _cache["at"] < CACHE_TTL_SEC and cached.get("limit") == limit:
            return {k: v for k, v in cached.items() if k != "limit"}

    if not _configured():
        payload = {
            "moments": FALLBACK_MOMENTS[:limit],
            "source": "fallback",
            "configured": False,
            "message": "Set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env to load live Instagram media.",
        }
    else:
        try:
            moments = _fetch_instagram(limit)
            payload = {
                "moments": moments,
                "source": "instagram",
                "configured": True,
            }
        except Exception as exc:  # noqa: BLE001 — surface any Graph/network failure as fallback
            payload = {
                "moments": FALLBACK_MOMENTS[:limit],
                "source": "fallback",
                "configured": True,
                "error": str(exc),
            }

    with _cache_lock:
        _cache["at"] = now
        _cache["payload"] = {**payload, "limit": limit}

    return payload


# Content Security Policy.
#
# 'unsafe-eval' and inline styles are required by the DC runtime, not by choice:
# support.js evaluates component code with new Function, and the pages carry
# inline style attributes throughout. Removing either means reworking the
# framework, so this is the strictest policy the site can actually run under
# rather than the strictest policy that exists.
#
# Classic inline <script> blocks are intentionally NOT allowed (no 'unsafe-inline'
# in script-src). Page motion helpers must live in external .js files
# (e.g. blends-motion.js) so the local CSP does not strip them — GitHub Pages
# does not send this header, which is why a missing externalization only
# breaks locally.
#
# What it still buys: script, connect, image and font sources are restricted to
# our own origin plus the two map services, so an injected <script src> or an
# exfiltration fetch to an arbitrary host is blocked. Framing, plugins, base-tag
# rewriting and form posts are denied outright.
#
# Tighten `connect-src` and `img-src` when the tile and geocode providers change.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://tile.openstreetmap.org",
    "connect-src 'self' https://photon.komoot.io",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
])

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # The locator asks for geolocation; nothing else is needed, and no third
    # party should be able to ask on our behalf.
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
    "X-Frame-Options": "DENY",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/api/instagram/moments", "/api/instagram/moments/"):
            qs = urllib.parse.parse_qs(parsed.query)
            limit = qs.get("limit", [str(DEFAULT_LIMIT)])[0]
            try:
                body = get_moments(int(limit))
                raw = json.dumps(body).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            except Exception as exc:  # noqa: BLE001
                raw = json.dumps({"error": str(exc), "moments": FALLBACK_MOMENTS, "source": "fallback"}).encode("utf-8")
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            return

        if parsed.path == "/api/health":
            raw = json.dumps({"ok": True, "instagramConfigured": _configured()}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return

        return super().do_GET()

    def log_message(self, fmt, *args):
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    _load_dotenv()
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    status = "live Instagram" if _configured() else "fallback gallery (add .env credentials for Instagram)"
    print(f"Brisa Bay server on http://127.0.0.1:{port}")
    print(f"Moments API: http://127.0.0.1:{port}/api/instagram/moments")
    print(f"Mode: {status}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
        server.server_close()


if __name__ == "__main__":
    main()
