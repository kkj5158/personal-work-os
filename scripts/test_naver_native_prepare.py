import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).with_name("naver_native_prepare.py"))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class NativePrepareTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def article(self, name="a.html", text="한글 원문", encoding="utf-8", extra=""):
        html = f'<html><head><meta charset="{encoding}"><title>같은 제목</title></head><body><p>{text}</p>{extra}</body></html>'
        (self.source / name).write_bytes(html.encode(encoding))
        return html

    def test_inspect_never_prepares_or_imports(self):
        self.article()
        report = adapter.run(self.source, self.root / "inspect")
        self.assertEqual(report["committedPosts"], 0)
        self.assertEqual(report["batches"], 0)
        self.assertIn("UNTESTED", report["officialExportCompatibility"])

    def test_exact_report_required_and_source_change_rejected(self):
        self.article()
        old = adapter.run(self.source, self.root / "inspect")
        self.article(text="changed")
        with self.assertRaisesRegex(ValueError, "APPROVAL_REQUIRED"):
            adapter.run(self.source, self.root / "bad", True, old["reportSha256"])

    def test_cp949_original_bytes_preserved_unknown_dates_not_fabricated(self):
        html = self.article(encoding="cp949")
        report = adapter.run(self.source, self.root / "inspect")
        adapter.run(self.source, self.root / "prepared", True, report["reportSha256"])
        with zipfile.ZipFile(self.root / "prepared/batch-00001.zip") as batch:
            manifest = json.loads(batch.read("manifest.json"))
            post = json.loads(batch.read(manifest["posts"][0]))
            self.assertIsNone(post["originalPublishedAt"])
            self.assertIsNone(post["sourceCategory"])
            self.assertEqual(post["sourceHtml"], html)
            self.assertEqual(batch.read(post["sourceArtifact"]["path"]), html.encode("cp949"))
            self.assertEqual(post["fidelityStatus"], "NEEDS_REVIEW")

    def test_media_paths_remote_and_traversal_never_read(self):
        (self.root / "private.png").write_bytes(b"\x89PNG\r\n\x1a\nprivate")
        (self.source / "one.png").write_bytes(b"\x89PNG\r\n\x1a\nsynthetic")
        self.article(extra='<img src="one.png"><img src="../private.png"><img src="https://example.invalid/p.png"><img src="missing.png">')
        rows = list(adapter.inspect(self.source))
        row, post, assets = rows[0]
        self.assertEqual(row["images"], 1)
        self.assertEqual(post["assets"][0]["sourceRef"], "one.png")
        self.assertEqual(len(row["warnings"]), 6)
        self.assertEqual(len(assets), 2)

    def test_same_title_distinct_posts_and_deterministic_chunks(self):
        for i in range(53):
            self.article(name=f"{i:03d}.html", text=f"SYNTHETIC {i}")
        report = adapter.run(self.source, self.root / "inspect")
        result = adapter.run(self.source, self.root / "prepared", True, report["reportSha256"])
        self.assertEqual(result["batches"], 2)
        receipt = json.loads((self.root / "prepared/review-report.json").read_bytes())
        self.assertEqual([b["posts"] for b in receipt["batches"]], [50, 3])
        self.assertTrue(all(b["bytes"] < 8_000_000 for b in receipt["batches"]))
        adapter.run(self.source, self.root / "repeat", True, report["reportSha256"])
        repeated = json.loads((self.root / "repeat/review-report.json").read_bytes())
        self.assertEqual(receipt["batches"], repeated["batches"])
        with self.assertRaises(FileExistsError):
            adapter.run(self.source, self.root / "prepared", True, report["reportSha256"])

    def test_unknown_layout_and_invalid_encoding_are_review_only(self):
        (self.source / "a.html").write_text("<div>unknown layout</div>")
        (self.source / "b.html").write_bytes(b"\xff\xff")
        rows = list(adapter.inspect(self.source))
        self.assertTrue(all(not row[0]["eligible"] for row in rows))
        self.assertTrue(all(row[1] is None for row in rows))

    def test_source_size_bound_and_scripts_not_body(self):
        self.article(extra="<script>secret_script()</script><style>bad_css</style>")
        row, post, _ = list(adapter.inspect(self.source))[0]
        self.assertNotIn("secret_script", post["bodyText"])
        self.assertIn("secret_script", post["sourceHtml"])
        (self.source / "big.html").write_bytes(b"a" * (adapter.MAX_FILE + 1))
        self.assertFalse(list(adapter.inspect(self.source))[1][0]["eligible"])


if __name__ == "__main__":
    unittest.main()
