#!/usr/bin/env python3
"""Tests for server.py and for the CSP it shares with the site.

    python3 tools/test-server.py

server.py is only the local dev server, so the bar here is lower than for the
locator. Two things still earn tests:

  * the CSP wiring. tools/csp.json is the single source of truth for a policy
    that production enforces through a meta tag and nothing else — Wix sends no
    security headers — so a policy that drifts, or a page mapped to the wrong
    one, is a real hole rather than a tidiness problem;
  * the hosting behaviours this server exists to imitate. Wix serves uploaded
    files verbatim with no directory indexes and no server-side code, and the
    point of developing against this file is that those limits bite locally
    instead of after a release.

Standard library only: this repo has no package.json and server.py has no pip
dependencies, and that is worth keeping.
"""

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402

CSP = json.loads((ROOT / "tools" / "csp.json").read_text(encoding="utf8"))
PAGES = [
    "index.html", "about.html", "ourWines.html", "findBrisaBay.html",
    "privacy.html", "terms.html", "accessibility.html", "404.html",
]


class CspSourceOfTruth(unittest.TestCase):
    def test_every_page_carries_the_policy_csp_json_assigns_it(self):
        for name in PAGES:
            html = (ROOT / name).read_text(encoding="utf8")
            expected = CSP["policies"][CSP["pages"].get(name, CSP["default"])]
            self.assertIn(
                f'<meta http-equiv="Content-Security-Policy" content="{expected}">',
                html,
                f"{name} does not carry the policy tools/csp.json assigns it",
            )

    def test_inline_script_stays_forbidden(self):
        # The DC runtime needs 'unsafe-eval' for new Function. It does not need
        # 'unsafe-inline', and allowing it would give an injected <script> block
        # everything it wants.
        for name, policy in CSP["policies"].items():
            script_src = [d for d in policy.split("; ") if d.startswith("script-src")][0]
            self.assertNotIn("unsafe-inline", script_src, f"{name} allows inline script")

    def test_only_the_locator_widens_the_policy(self):
        # A page gets the wider policy by being named in csp.json, not by
        # accident. If another page needs external origins, that is a decision
        # to make explicitly here.
        self.assertEqual(CSP["pages"], {"findBrisaBay.html": "locator"})
        self.assertEqual(CSP["default"], "base")

    def test_the_base_policy_reaches_nothing_off_origin(self):
        base = CSP["policies"]["base"]
        self.assertNotIn("https://", base)

    def test_the_locator_allows_exactly_the_origins_it_uses(self):
        locator = CSP["policies"]["locator"]
        for origin in ("https://tile.openstreetmap.org", "https://photon.komoot.io",
                       "https://www.wixapis.com", "https://esm.sh"):
            self.assertIn(origin, locator)

    def test_frame_ancestors_is_header_only(self):
        # frame-ancestors is ignored in a meta tag, so it must not be smuggled
        # into the page policies where it would read as protection the site
        # does not have. server.py adds it; production cannot.
        for policy in CSP["policies"].values():
            self.assertNotIn("frame-ancestors", policy)
        self.assertIn("frame-ancestors", CSP["headerOnly"])


class PolicySelection(unittest.TestCase):
    def test_the_locator_path_gets_the_locator_policy(self):
        self.assertIn("https://esm.sh", server.policy_for("/findBrisaBay.html"))

    def test_an_ordinary_page_gets_the_base_policy(self):
        self.assertNotIn("https://esm.sh", server.policy_for("/about.html"))

    def test_the_root_resolves_to_the_home_page_policy(self):
        self.assertEqual(server.policy_for("/"), server.policy_for("/index.html"))

    def test_the_server_adds_the_directives_meta_cannot_express(self):
        self.assertIn("frame-ancestors 'none'", server.policy_for("/about.html"))

    def test_an_unknown_path_still_gets_a_policy(self):
        self.assertIn("default-src 'self'", server.policy_for("/nope.html"))


class SecurityHeaders(unittest.TestCase):
    def test_the_expected_headers_are_present(self):
        for h in ("X-Content-Type-Options", "Referrer-Policy",
                  "Permissions-Policy", "X-Frame-Options"):
            self.assertIn(h, server.SECURITY_HEADERS)


class WixParity(unittest.TestCase):
    """The dev server must not offer what production cannot."""

    def test_no_api_routes_remain(self):
        source = (ROOT / "server.py").read_text(encoding="utf8")
        self.assertNotIn("/api/", source)

    def test_no_pages_are_reachable_without_their_extension(self):
        # Wix has no directory indexes and no rewrite rules, so a pretty URL is
        # a 404 there. do_GET refuses trailing-slash paths for the same reason.
        source = (ROOT / "server.py").read_text(encoding="utf8")
        self.assertIn('endswith("/")', source)

    def test_the_cloudflare_files_are_gone(self):
        for name in ("_headers", "_redirects", "functions"):
            self.assertFalse((ROOT / name).exists(), f"{name} still present")

    def test_the_release_output_directory_is_dist(self):
        cfg = json.loads((ROOT / "wix.config.json").read_text(encoding="utf8"))
        self.assertEqual(cfg["site"]["outputDirectory"], "dist")


class RedirectStubs(unittest.TestCase):
    """A 301 is not available on Wix, so the old URLs redirect from the page."""

    def test_each_stub_points_at_a_page_that_exists(self):
        for stub, target in (("where-to-buy.html", "findBrisaBay.html"),
                             ("wines.html", "ourWines.html")):
            html = (ROOT / stub).read_text(encoding="utf8")
            self.assertIn(f'content="0;url=/{target}"', html)
            self.assertTrue((ROOT / target).exists())

    def test_the_redirect_helper_refuses_to_leave_the_origin(self):
        js = (ROOT / "redirect.js").read_text(encoding="utf8")
        # The data-to value is validated against a same-origin path pattern, so
        # a stub cannot be turned into an open redirect by editing one attribute.
        self.assertIn("^\\/[A-Za-z0-9._~\\-/]*$", js)


class CuratedMoments(unittest.TestCase):
    """Bottled Moments ships with the page; there is no endpoint to fill it."""

    def test_the_homepage_calls_no_instagram_endpoint(self):
        html = (ROOT / "index.html").read_text(encoding="utf8")
        self.assertNotIn("/api/instagram", html)
        self.assertNotIn("loadMoments", html)

    def test_every_curated_image_exists_on_disk(self):
        import re
        html = (ROOT / "index.html").read_text(encoding="utf8")
        block = html[html.index("const curatedMoments"):]
        block = block[:block.index("];")]
        srcs = re.findall(r"src: '([^']+)'", block)
        self.assertGreaterEqual(len(srcs), 6)
        for src in srcs:
            self.assertTrue((ROOT / src).exists(), f"missing {src}")

    def test_every_curated_entry_has_alt_text(self):
        import re
        html = (ROOT / "index.html").read_text(encoding="utf8")
        block = html[html.index("const curatedMoments"):]
        block = block[:block.index("];")]
        entries = re.findall(r"\{[^}]*\}", block)
        for entry in entries:
            self.assertIn("alt: '", entry)


if __name__ == "__main__":
    unittest.main(verbosity=2)
