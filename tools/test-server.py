#!/usr/bin/env python3
"""Smoke tests for server.py.

    python3 tools/test-server.py

server.py had no tests. It is only the dev server, so the bar here is lower than
for the locator — but three things in it are worth pinning down:

  * the fallback path, which is what production actually serves today, since
    GitHub Pages does not run this file and /api/instagram/moments 404s there;
  * media normalisation, which has real branching for video and carousel posts
    and silently drops anything it cannot resolve to an image;
  * the security headers, whose CSP must stay in step with the <meta> copy now
    embedded in every page — they are the same policy expressed twice.

Standard library only: this repo has no package.json and server.py has no pip
dependencies, and that is worth keeping.
"""

import json
import os
import sys
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import server  # noqa: E402


class CaptionAlt(unittest.TestCase):
    def test_missing_caption_falls_back(self):
        self.assertIn("brisabaywines", server._caption_alt(None))
        self.assertIn("brisabaywines", server._caption_alt(""))

    def test_whitespace_is_collapsed(self):
        self.assertEqual(server._caption_alt("a\n\n  b\tc"), "a b c")

    def test_long_captions_are_truncated_with_an_ellipsis(self):
        alt = server._caption_alt("x" * 200)
        self.assertEqual(len(alt), 141)          # 140 chars + the ellipsis
        self.assertTrue(alt.endswith("…"))

    def test_a_caption_at_the_limit_is_not_ellipsised(self):
        self.assertEqual(server._caption_alt("y" * 140), "y" * 140)


class NormalizeMedia(unittest.TestCase):
    def test_image_uses_media_url(self):
        out = server._normalize_media({"id": "1", "media_type": "IMAGE", "media_url": "a.jpg"})
        self.assertEqual(out["src"], "a.jpg")
        self.assertEqual(out["mediaType"], "IMAGE")

    def test_video_prefers_the_thumbnail(self):
        # A video's media_url is the mp4; using it as an <img src> shows nothing.
        out = server._normalize_media(
            {"id": "2", "media_type": "VIDEO", "media_url": "clip.mp4", "thumbnail_url": "thumb.jpg"}
        )
        self.assertEqual(out["src"], "thumb.jpg")

    def test_carousel_falls_back_to_its_first_child(self):
        out = server._normalize_media({
            "id": "3", "media_type": "CAROUSEL_ALBUM",
            "children": {"data": [{"media_url": "first.jpg"}, {"media_url": "second.jpg"}]},
        })
        self.assertEqual(out["src"], "first.jpg")

    def test_items_with_no_usable_image_are_dropped(self):
        self.assertIsNone(server._normalize_media({"id": "4", "media_type": "IMAGE"}))
        self.assertIsNone(server._normalize_media({"id": "5", "media_type": "CAROUSEL_ALBUM",
                                                   "children": {"data": []}}))

    def test_permalink_defaults_to_the_profile(self):
        out = server._normalize_media({"id": "6", "media_type": "IMAGE", "media_url": "a.jpg"})
        self.assertIn("instagram.com/brisabaywines", out["permalink"])

    def test_id_falls_back_to_src_so_react_keys_stay_stable(self):
        out = server._normalize_media({"media_type": "IMAGE", "media_url": "a.jpg"})
        self.assertEqual(out["id"], "a.jpg")


class GetMoments(unittest.TestCase):
    def setUp(self):
        server._cache = {"at": 0.0, "payload": None}

    @mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "", "INSTAGRAM_ACCESS_TOKEN": ""}, clear=False)
    def test_unconfigured_serves_the_fallback_gallery(self):
        # This is the production path today.
        out = server.get_moments(4)
        self.assertEqual(out["source"], "fallback")
        self.assertFalse(out["configured"])
        self.assertEqual(len(out["moments"]), 4)

    @mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "", "INSTAGRAM_ACCESS_TOKEN": ""}, clear=False)
    def test_limit_is_clamped_to_a_sane_range(self):
        # `limit or DEFAULT_LIMIT` means 0 reads as "not specified" and takes the
        # default rather than clamping to 1 — ?limit=0 returns a full strip.
        self.assertEqual(len(server.get_moments(0)["moments"]), server.DEFAULT_LIMIT)

        # A negative is not falsy, so it does clamp to the floor of 1.
        server._cache = {"at": 0.0, "payload": None}
        self.assertEqual(len(server.get_moments(-5)["moments"]), 1)

        server._cache = {"at": 0.0, "payload": None}
        self.assertEqual(len(server.get_moments(3)["moments"]), 3)

        # Ceiling is 25; the fallback list is shorter, so it caps there instead.
        server._cache = {"at": 0.0, "payload": None}
        self.assertEqual(len(server.get_moments(9999)["moments"]), len(server.FALLBACK_MOMENTS))

    @mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "u", "INSTAGRAM_ACCESS_TOKEN": "t"}, clear=False)
    def test_a_graph_failure_degrades_to_the_fallback(self):
        # A dead token or a network blip must not blank the homepage strip.
        with mock.patch.object(server, "_fetch_instagram", side_effect=RuntimeError("boom")):
            out = server.get_moments(3)
        self.assertEqual(out["source"], "fallback")
        self.assertTrue(out["configured"])
        self.assertIn("boom", out["error"])
        self.assertEqual(len(out["moments"]), 3)

    @mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "u", "INSTAGRAM_ACCESS_TOKEN": "t"}, clear=False)
    def test_a_successful_fetch_is_cached(self):
        calls = []

        def fake(limit):
            calls.append(limit)
            return [{"id": "x", "src": "x.jpg", "alt": "", "permalink": "p"}]

        with mock.patch.object(server, "_fetch_instagram", side_effect=fake):
            first = server.get_moments(5)
            second = server.get_moments(5)
        self.assertEqual(first["source"], "instagram")
        self.assertEqual(second["source"], "instagram")
        self.assertEqual(len(calls), 1, "second call should have been served from cache")

    @mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "u", "INSTAGRAM_ACCESS_TOKEN": "t"}, clear=False)
    def test_a_different_limit_is_not_served_from_cache(self):
        calls = []

        def fake(limit):
            calls.append(limit)
            return [{"id": "x", "src": "x.jpg", "alt": "", "permalink": "p"}]

        with mock.patch.object(server, "_fetch_instagram", side_effect=fake):
            server.get_moments(5)
            server.get_moments(6)
        self.assertEqual(calls, [5, 6])

    def test_the_returned_payload_never_leaks_the_cache_key(self):
        with mock.patch.dict(os.environ, {"INSTAGRAM_USER_ID": "", "INSTAGRAM_ACCESS_TOKEN": ""}):
            server.get_moments(2)
            cached = server.get_moments(2)
        self.assertNotIn("limit", cached)


class FallbackGallery(unittest.TestCase):
    def test_every_fallback_image_exists_on_disk(self):
        # These are the images production actually shows. A rename during the
        # WebP conversion would otherwise surface as a broken homepage strip.
        for m in server.FALLBACK_MOMENTS:
            self.assertTrue((ROOT / m["src"]).is_file(), f"missing {m['src']}")

    def test_every_fallback_entry_has_alt_text(self):
        for m in server.FALLBACK_MOMENTS:
            self.assertTrue(m["alt"].strip(), f"{m['id']} has no alt text")


class SecurityHeaders(unittest.TestCase):
    def test_the_expected_headers_are_present(self):
        for h in ("Content-Security-Policy", "X-Content-Type-Options",
                  "Referrer-Policy", "Permissions-Policy", "X-Frame-Options"):
            self.assertIn(h, server.SECURITY_HEADERS)

    def test_inline_script_stays_forbidden(self):
        # The local CSP is deliberately stricter than GitHub Pages so a classic
        # inline <script> fails here rather than in production.
        script_src = [d for d in server.CSP.split("; ") if d.startswith("script-src")][0]
        self.assertNotIn("unsafe-inline", script_src)

    def test_the_csp_matches_the_copy_embedded_in_every_page(self):
        # server.py and the <meta> tags are the same policy expressed twice;
        # meta cannot express frame-ancestors, so that one is expected to differ.
        import re
        server_directives = {d.split(" ")[0]: d for d in server.CSP.split("; ")}
        for page in sorted(ROOT.glob("*.html")):
            html = page.read_text(encoding="utf8")
            m = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', html)
            self.assertIsNotNone(m, f"{page.name} has no meta CSP")
            meta_directives = {d.split(" ")[0]: d for d in m.group(1).split("; ")}
            self.assertNotIn("frame-ancestors", meta_directives,
                             f"{page.name}: meta cannot express frame-ancestors")
            for name, directive in meta_directives.items():
                self.assertEqual(directive, server_directives.get(name),
                                 f"{page.name}: {name} has drifted from server.py")


class DotEnv(unittest.TestCase):
    def test_values_are_parsed_and_quotes_stripped(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            env = Path(d) / ".env"
            env.write_text('# comment\nA=1\nB="two"\nC=\'three\'\nD=has=equals\nbad line\n')
            with mock.patch.object(server, "ROOT", Path(d)), \
                 mock.patch.dict(os.environ, {}, clear=True):
                server._load_dotenv()
                self.assertEqual(os.environ["A"], "1")
                self.assertEqual(os.environ["B"], "two")
                self.assertEqual(os.environ["C"], "three")
                self.assertEqual(os.environ["D"], "has=equals")
                self.assertNotIn("bad line", os.environ)

    def test_the_real_environment_wins_over_the_file(self):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / ".env").write_text("A=from_file\n")
            with mock.patch.object(server, "ROOT", Path(d)), \
                 mock.patch.dict(os.environ, {"A": "from_env"}, clear=True):
                server._load_dotenv()
                self.assertEqual(os.environ["A"], "from_env")


if __name__ == "__main__":
    unittest.main(verbosity=2)
