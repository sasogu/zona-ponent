import base64
import hashlib
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


build = module("generar")
audit = module("check_public")


class BuildTests(unittest.TestCase):
    def test_demo_and_invalid_slugs(self):
        good = {"title": "Demo", "source": "examples/demo.html", "slug": "demo"}
        self.assertEqual(len(build.validated_decks({"decks": [good]})), 1)
        for slug in ("../private", "", "demo/other", "DEMO"):
            with self.assertRaises(ValueError):
                build.validated_decks({"decks": [dict(good, slug=slug)]})
        with self.assertRaises(ValueError):
            build.validated_decks({"decks": [good, good]})

    def test_credentials_stable_and_separate(self):
        first = build.credentials("fictional-password-for-tests", "01" * 32, "demo")
        self.assertEqual(first, build.credentials("fictional-password-for-tests", "01" * 32, "demo"))
        other = build.credentials("fictional-password-for-tests", "01" * 32, "other")
        self.assertTrue(all(a != b for a, b in zip(first, other)))
        changed = build.credentials("fictional-password-for-tests", "02" * 32, "demo")
        self.assertEqual(first[:2], changed[:2])
        self.assertNotEqual(first[2], changed[2])

    def test_public_audit(self):
        self.assertTrue(audit.problems(Path(".env"), ""))
        self.assertTrue(audit.problems(Path("dist/index.html"), ""))
        self.assertTrue(audit.problems(Path("file.txt"), "01" * 32))
        self.assertTrue(audit.problems(Path("file.txt"), "100." + "70.1.2"))
        self.assertFalse(audit.problems(Path(".env.example"), "SYNC_AUTH_SECRET=\nHOST=127.0.0.1"))

    def test_reviewed_screenshot_requires_exact_fingerprint(self):
        path = Path("docs/images/fixture.png")
        raw = b"\x89PNG\r\n\x1a\nfictional-test-data"
        reviewed = {str(path): base64.b64encode(hashlib.sha256(raw).digest()).decode("ascii")}
        self.assertTrue(audit.approved_image(path, raw, reviewed))
        self.assertFalse(audit.approved_image(path, raw + b"changed", reviewed))
        self.assertFalse(audit.approved_image(Path("other.png"), raw, reviewed))
        self.assertFalse(audit.approved_image(path, b"not-an-image", reviewed))


if __name__ == "__main__":
    unittest.main()
