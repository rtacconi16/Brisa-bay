#!/usr/bin/env python3
"""Brisa Bay local dev server.

    python3 server.py        # http://127.0.0.1:8080

Serves the site exactly the way Wix static hosting serves it, so that what
works locally works when released:

  * every file is served from the repo root at its own path — `/about.html`
    is `/about.html`, and there are no pretty URLs. Wix does NOT serve
    `dir/index.html` for `/dir`, so neither does this.
  * unknown paths get 404.html, matching the site's custom 404.
  * no server-side code, no API routes. Wix runs none, so the site must not
    depend on any.

The one deliberate difference: this sends the security headers below, which
Wix does not send at all. They are here so local development matches the
intent of the meta CSP the pages carry, not because production has them.
See README.md, "Security headers on Wix", for what production actually gets.
"""

from __future__ import annotations

import json
import os
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Content Security Policy — see tools/csp.json, which is the source of truth
# shared with tools/check-pages.mjs and with the meta tag in each page.
#
# Production gets the meta tag only: Wix sends no headers. This server sends the
# real header (plus the directives meta cannot express) so local development is
# at least as strict as production, never less.
CSP = json.loads((ROOT / "tools" / "csp.json").read_text())


def policy_for(path: str) -> str:
    """The meta-equivalent policy for a request path, plus the header-only parts."""
    page = path.lstrip("/") or "index.html"
    name = CSP["pages"].get(page, CSP["default"])
    return CSP["policies"][name] + "; " + CSP["headerOnly"]


SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    # The locator asks for geolocation; nothing else is needed, and no third
    # party should be able to ask on our behalf.
    "Permissions-Policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
    # Not available in production — Wix cannot send it. Local only.
    "X-Frame-Options": "DENY",
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        self.send_header("Content-Security-Policy", policy_for(urllib.parse.urlparse(self.path).path))
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        """Serve the real 404 page, the way the released site does."""
        if code == 404:
            body = (ROOT / "404.html").read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # Wix has no directory indexes. Only "/" resolves to index.html.
        if parsed.path != "/" and parsed.path.endswith("/"):
            self.send_error(404)
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        import sys
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Brisa Bay dev server on http://127.0.0.1:{port}")
    print("Serving the repo root the way Wix serves it: .html paths, no pretty URLs.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
        server.server_close()


if __name__ == "__main__":
    main()
