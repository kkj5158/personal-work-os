import importlib.util
from base64 import b64decode
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

    def smarteditor(self, css=""):
        folder = self.source / "20261116_123456789012_fixture"
        folder.mkdir()
        html = f"""<html><head><meta charset="utf-8"><style>{css}</style></head><body>
        <p class="ugc-backup-category">카테고리</p>
        <div class="se-viewer"><div class="se-title-text">정확한 제목</div><div class="se-main-container">
        <div class="se-component se-text"><p class="se-text-paragraph">첫 줄<br>다음</p></div>
        <div class="se-component se-quotation"><p class="se-text-paragraph"><i>인용</i></p></div>
        <img src="one.png"><img src="https://example.invalid/remote.png"><img src="missing.png">
        <iframe src="https://example.invalid/media"></iframe><script>skip_me()</script>
        </div></div></body></html>"""
        original = html.encode("utf-8")
        (folder / "index.html").write_bytes(original)
        (folder / "one.png").write_bytes(b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="))
        return folder, original

    def test_smarteditor_extracts_ordered_content_and_keeps_original(self):
        _, original = self.smarteditor()
        row, post, assets = next(adapter.inspect(self.source))
        self.assertTrue(row["eligible"])
        self.assertEqual(row["folderDateHint"], "20261116")
        self.assertEqual(row["components"], ["se-text", "se-quotation"])
        self.assertEqual(post["externalPostId"], "123456789012")
        self.assertIsNone(post["originalPublishedAt"])
        self.assertIsNone(post["originalUrl"])
        self.assertEqual(post["title"], "정확한 제목")
        self.assertEqual(post["sourceCategory"], "카테고리")
        self.assertEqual(post["bodyText"], "첫 줄\n다음\n인용")
        self.assertEqual(assets[post["sourceArtifact"]["path"]], original)
        self.assertEqual([m["status"] for m in row["media"]], ["LOCAL_IMAGE", "REMOTE_NOT_FETCHED", "MISSING_IMAGE"])
        self.assertIn("EMBEDDED_MEDIA_NOT_FETCHED", row["warnings"])

    def test_smarteditor_oversize_original_and_image_are_inventoried_not_packaged(self):
        folder, original = self.smarteditor(css="x" * adapter.MAX_HTML_CHARS)
        (folder / "one.png").write_bytes(b"x" * (adapter.MAX_FILE + 1))
        summary = adapter.run(self.source, self.root / "inspect")
        row = json.loads((self.root / "inspect/review-report.json").read_bytes())["items"][0]
        self.assertEqual(row["sourceSha256"], adapter.sha(original))
        self.assertCountEqual(row["blockers"], ["SOURCE_HTML_FIELD_LIMIT", "IMAGE_FILE_SIZE_LIMIT"])
        result = adapter.run(self.source, self.root / "prepare", True, summary["reportSha256"])
        self.assertEqual(result["batches"], 0)
        self.assertFalse(list((self.root / "prepare").glob("*.zip")))

    def test_native_v2_packages_large_original_once_and_is_deterministic(self):
        _, original = self.smarteditor(css="x" * adapter.MAX_HTML_CHARS)
        inspection = adapter.run(self.source, self.root / "inspect", native_v2=True)
        self.assertEqual(inspection["eligible"], 1)
        hashes = []
        for name in ("prepare", "again"):
            result = adapter.run(self.source, self.root / name, True, inspection["reportSha256"], native_v2=True)
            self.assertEqual(result["batches"], 1)
            batch = next((self.root / name).glob("*.orbit-native.zip"))
            hashes.append(adapter.sha(batch.read_bytes()))
            with zipfile.ZipFile(batch) as zip_file:
                manifest = json.loads(zip_file.read("manifest.json"))
                self.assertEqual(manifest["format"], adapter.NATIVE_FORMAT)
                post = json.loads(zip_file.read(manifest["posts"][0]))
                self.assertNotIn("sourceHtml", post)
                self.assertEqual(zip_file.read(post["sourceArtifact"]["path"]), original)
                self.assertEqual(post["sourceArtifact"]["sha256"], adapter.sha(original))
                self.assertEqual(adapter.sha(zip_file.read(post["assets"][0]["path"])), post["assets"][0]["sha256"])
        self.assertEqual(hashes[0], hashes[1])


if __name__ == "__main__":
    unittest.main()
