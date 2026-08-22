#!/usr/bin/env python3
"""Checks for the CSP source of truth and a few hosting leftovers.

    python3 tools/test-server.py

The site is Astro on Wix Headless now. Local development is `npm run dev`;
this file no longer drives server.py. It still exists because the CSP is the
only security policy production enforces (as a meta tag — Wix sends no
headers), so drift between tools/csp.json and src/data/site.ts is a real hole.
"""

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

CSP = json.loads((ROOT / "tools" / "csp.json").read_text(encoding="utf8"))


def _quoted(src: str, key: str) -> str:
    m = re.search(rf'{key}:\s*"([^"]+)"', src)
    if not m:
        raise AssertionError(f"missing {key} CSP string in site.ts")
    return m.group(1)


class CspSourceOfTruth(unittest.TestCase):
    def test_site_ts_matches_csp_json(self):
        site = (ROOT / "src" / "data" / "site.ts").read_text(encoding="utf8")
        self.assertEqual(_quoted(site, "base"), CSP["policies"]["base"])
        self.assertEqual(_quoted(site, "locator"), CSP["policies"]["locator"])

    def test_layout_selects_the_policy_from_site_ts(self):
        layout = (ROOT / "src" / "layouts" / "Layout.astro").read_text(encoding="utf8")
        self.assertIn("locator ? CSP.locator : CSP.base", layout)
        self.assertIn('http-equiv="Content-Security-Policy"', layout)

    def test_inline_script_stays_forbidden(self):
        for name, policy in CSP["policies"].items():
            script_src = [d for d in policy.split("; ") if d.startswith("script-src")][0]
            self.assertNotIn("unsafe-inline", script_src, f"{name} allows inline script")
            self.assertNotIn("unsafe-eval", script_src, f"{name} allows eval")

    def test_only_the_locator_widens_the_policy(self):
        self.assertEqual(CSP["pages"], {"/findBrisaBay": "locator"})
        self.assertEqual(CSP["default"], "base")

    def test_the_base_policy_reaches_nothing_off_origin(self):
        base = CSP["policies"]["base"]
        self.assertNotIn("https://", base)

    def test_the_locator_allows_exactly_the_origins_it_uses(self):
        locator = CSP["policies"]["locator"]
        for origin in (
            "https://basemaps.cartocdn.com",
            "https://photon.komoot.io",
            "https://www.wixapis.com",
            "https://edge.wixapis.com",
        ):
            self.assertIn(origin, locator)
        self.assertNotIn("https://tile.openstreetmap.org", locator)
        self.assertNotIn("https://esm.sh", locator)

    def test_frame_ancestors_is_header_only(self):
        for policy in CSP["policies"].values():
            self.assertNotIn("frame-ancestors", policy)
        self.assertIn("frame-ancestors", CSP["headerOnly"])


class HostingLeftovers(unittest.TestCase):
    def test_the_cloudflare_files_are_gone(self):
        for name in ("_headers", "_redirects", "functions"):
            self.assertFalse((ROOT / name).exists(), f"{name} still present")

    def test_wix_config_is_astro_native(self):
        cfg = json.loads((ROOT / "wix.config.json").read_text(encoding="utf8"))
        self.assertEqual(cfg["siteId"], "f81bd804-9f61-4ed0-a239-a87bd5f499a0")
        self.assertNotIn("outputDirectory", cfg.get("site") or {})

    def test_html_aliases_are_server_redirects(self):
        mw = (ROOT / "src" / "middleware.ts").read_text(encoding="utf8")
        self.assertIn("'/wines': '/ourWines'", mw)
        self.assertIn("'/where-to-buy': '/findBrisaBay'", mw)
        self.assertIn(".html", mw)


class CuratedMoments(unittest.TestCase):
    def test_the_homepage_calls_no_instagram_endpoint(self):
        html = (ROOT / "src" / "partials" / "home.html").read_text(encoding="utf8")
        self.assertNotIn("/api/instagram", html)
        self.assertNotIn("loadMoments", html)

    def test_every_curated_image_exists_on_disk(self):
        html = (ROOT / "src" / "partials" / "home.html").read_text(encoding="utf8")
        srcs = re.findall(r'src="(/assets/web2/[^"]+)"', html)
        self.assertGreaterEqual(len(srcs), 6)
        for src in srcs:
            self.assertTrue((ROOT / src.lstrip("/")).exists(), f"missing {src}")

    def test_every_curated_img_has_alt_text(self):
        html = (ROOT / "src" / "partials" / "home.html").read_text(encoding="utf8")
        imgs = re.findall(r"<img\b[^>]*>", html)
        self.assertGreater(len(imgs), 0)
        for tag in imgs:
            self.assertRegex(tag, r"\balt=")


if __name__ == "__main__":
    unittest.main(verbosity=2)
