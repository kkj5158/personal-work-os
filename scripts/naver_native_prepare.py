"""Offline, bounded native HTML review adapter. Never connects to Naver or imports.

Inspect: python scripts/naver_native_prepare.py SOURCE OUTPUT
Prepare only after inspecting: add --prepare --report-sha256 <printed report hash>
Original source bytes stay in SOURCE and in each prepared batch as private assets.
Actual Naver layout compatibility remains UNTESTED_PENDING_USER_ARCHIVE.
"""
import argparse
from datetime import datetime
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import uuid
from urllib.parse import unquote, urlsplit
import zipfile

MAX_FILE = 2_000_000
MAX_BATCH = 7_500_000
MAX_FILES = 100_000
MAX_TOTAL = 2_000_000_000
COMPATIBILITY = "UNTESTED_PENDING_USER_ARCHIVE"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def decode(data):
    # An explicit charset is authoritative. Never silently replace corrupt bytes.
    match = re.search(br'charset\s*=\s*["\x27\s]*([a-zA-Z0-9_-]+)', data[:4096], re.I)
    encoding = match.group(1).decode("ascii").lower() if match else "utf-8-sig"
    if encoding not in {"utf-8", "utf-8-sig", "euc-kr", "cp949", "windows-949"}:
        raise ValueError("UNSUPPORTED_ENCODING")
    if encoding in {"euc-kr", "windows-949"}:
        encoding = "cp949"
    return data.decode(encoding, errors="strict"), encoding


class Article(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.title, self.text, self.images, self.meta = [], [], [], {}
        self.in_title = False
        self.hidden = 0
        self.body = False
        self.saw_body = False
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "body":
            self.body = self.saw_body = True
        if tag == "title":
            self.in_title = True
        if tag in {"script", "style", "template", "noscript"}:
            self.hidden += 1
        if tag == "meta":
            self.meta[a.get("property", a.get("name", "")).lower()] = a.get("content", "")
        if self.body and not self.hidden:
            if tag == "img":
                self.images.append(a.get("src", ""))
            if tag in {"br", "p", "div", "h1", "h2", "h3", "li", "blockquote"}:
                self.text.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
        if tag in {"script", "style", "template", "noscript"}:
            self.hidden = max(0, self.hidden - 1)
        if tag == "body":
            self.body = False
        if self.body and not self.hidden and tag in {"p", "div", "li", "blockquote"}:
            self.text.append("\n")

    def handle_data(self, text):
        if self.in_title:
            self.title.append(text)
        if self.body and not self.hidden:
            self.text.append(text)


def read_local(path, root):
    if path.is_symlink() or not path.resolve().is_relative_to(root) or not path.is_file():
        raise ValueError("UNSAFE_OR_MISSING_FILE")
    if path.stat().st_size > MAX_FILE:
        raise ValueError("FILE_TOO_LARGE")
    with path.open("rb") as file:
        data = file.read(MAX_FILE + 1)
    if len(data) > MAX_FILE:
        raise ValueError("FILE_GREW_OVER_LIMIT")
    return data


def inspect(root):
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("UNPACK_LOCALLY_FIRST_NO_PASSWORD_INPUT")
    count, total, inventory = 0, 0, []
    for path in root.rglob("*"):
        count += 1
        if count > MAX_FILES:
            raise ValueError("SOURCE_FILE_COUNT_LIMIT")
        if path.is_symlink():
            raise ValueError("SOURCE_SYMLINK_REJECTED")
        if not path.is_file():
            continue
        total += path.stat().st_size
        if total > MAX_TOTAL:
            raise ValueError("SOURCE_SIZE_LIMIT_SPLIT_LOCALLY")
        inventory.append(path)
    for path in sorted(inventory):
        if path.suffix.lower() not in {".html", ".htm"}:
            continue
        row = {"path": path.relative_to(root).as_posix(), "warnings": [], "eligible": False}
        try:
            data = read_local(path, root)
            html, encoding = decode(data)
            article = Article(html)
            title = article.meta.get("og:title") or "".join(article.title).strip()
            body = "".join(article.text).strip()
            if not article.saw_body or not title or not body or len(title) > 500 or len(body) > 500_000 or len(html) > 500_000:
                raise ValueError("UNKNOWN_LAYOUT_OR_EMPTY_CONTENT")
            date = article.meta.get("article:published_time") or None
            if date and not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)", date):
                date = None
                row["warnings"].append("UNPARSED_DATE")
            if date:
                try:
                    datetime.fromisoformat(date)
                except ValueError:
                    date = None
                    row["warnings"].append("UNPARSED_DATE")
            # Metadata is source evidence only; absence is never inferred from names.
            category = article.meta.get("article:section") or None
            url = article.meta.get("og:url") or None
            if url and not re.fullmatch(r"https://(?:m\.)?blog\.naver\.com/(?:[^/?#]+/\d+/?|PostView\.naver\?logNo=\d+)", url):
                url = None
                row["warnings"].append("UNRECOGNIZED_SOURCE_URL")
            assets, media = [], {}
            for ref in article.images:
                try:
                    parsed = urlsplit(ref)
                    if not ref or parsed.scheme or parsed.netloc or parsed.query or parsed.fragment or "\\" in ref:
                        raise ValueError("REMOTE_OR_UNSAFE_MEDIA_NOT_FETCHED")
                    source = path.parent / unquote(parsed.path)
                    image = read_local(source, root)
                    if not (image.startswith(b"\x89PNG\r\n\x1a\n") or image.startswith(b"\xff\xd8\xff")):
                        raise ValueError("UNSUPPORTED_MEDIA")
                    asset_id = str(uuid.uuid5(uuid.NAMESPACE_URL, row["path"] + "|" + ref + "|" + sha(image)))
                    name = "assets/" + asset_id
                    if not any(a["sourceRef"] == ref for a in assets):
                        assets.append({"id": asset_id, "path": name, "sourceRef": ref})
                        media[name] = image
                except (ValueError, OSError):
                    row["warnings"].append("MISSING_UNSAFE_OR_UNSUPPORTED_MEDIA")
            if len(assets) > 20:
                raise ValueError("POST_IMAGE_LIMIT")
            original = "originals/" + sha(data) + ".bin"
            post = {"title": title, "bodyText": body, "sourceHtml": html, "originalPublishedAt": date,
                    "sourceCategory": category, "originalUrl": url, "sourceVisibility": "UNKNOWN",
                    "fidelityStatus": "NEEDS_REVIEW", "assets": assets,
                    "sourceArtifact": {"path": original, "sha256": sha(data), "encoding": encoding}}
            row.update(title=title, originalPublishedAt=date, category=category, sourceSha256=sha(data),
                       encoding=encoding, images=len(assets), media=[{"reference": a["sourceRef"], "sha256": sha(media[a["path"]])} for a in assets], eligible=True)
            row["warnings"] += ["NATIVE_LAYOUT_UNVERIFIED", "TEXT_EXTRACTED_FROM_HTML_REVIEW_REQUIRED"]
            if not date:
                row["warnings"].append("UNKNOWN_DATE")
            yield row, post, {original: data, **media}
        except (ValueError, UnicodeError, OSError) as exc:
            row["warnings"].append(str(exc) if isinstance(exc, ValueError) and not isinstance(exc, UnicodeError) else "SOURCE_READ_OR_ENCODING_FAILED")
            yield row, None, {}


def run(source, output, prepare=False, approval=None):
    source, output = Path(source).resolve(strict=True), Path(output).resolve()
    if output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("OUTPUT_MUST_BE_SEPARATE_FROM_SOURCE")
    # Refuse reuse: completed chunks are immutable and cannot be overwritten.
    output.mkdir(parents=True, exist_ok=False)
    report = {"format": "native-html-review/v1", "officialExportCompatibility": COMPATIBILITY,
              "committedPosts": 0, "items": [], "batches": []}
    # First pass stores bounded metadata only. Never retains the whole export in RAM.
    for row, _, _ in inspect(source):
        report["items"].append(row)
    report_hash = sha(encoded(report["items"]))
    report["reportSha256"] = report_hash
    if prepare:
        if approval != report_hash:
            raise ValueError("EXACT_INSPECTION_REPORT_APPROVAL_REQUIRED")
        files, posts, size = {}, [], 0

        def flush():
            nonlocal files, posts, size
            if not posts:
                return
            files["manifest.json"] = encoded({"format": "orbit-naver-archive/v1", "posts": posts,
                "adapter": "native-html-review/v1", "reviewReportSha256": report_hash})
            name = "batch-%05d.zip" % (len(report["batches"]) + 1)
            target = output / name
            with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_STORED) as archive:
                for key, value in files.items():
                    entry = zipfile.ZipInfo(key, date_time=(1980, 1, 1, 0, 0, 0))
                    entry.compress_type = zipfile.ZIP_STORED
                    archive.writestr(entry, value)
            if target.stat().st_size > 8_000_000:
                raise ValueError("BATCH_LIMIT")
            report["batches"].append({"file": name, "sha256": sha(target.read_bytes()), "posts": len(posts), "bytes": target.stat().st_size})
            files, posts, size = {}, [], 0

        prior_rows = {p["path"]: p for p in report["items"]}
        observed = set()
        for row, post, assets in inspect(source):
            observed.add(row["path"])
            prior = prior_rows.get(row["path"])
            if row != prior:
                raise ValueError("SOURCE_CHANGED_SINCE_INSPECTION")
            if post is None:
                continue
            key = "posts/" + sha(row["path"].encode()) + ".json"
            additions = {key: encoded(post), **assets}
            if any(len(v) > MAX_FILE for v in additions.values()):
                raise ValueError("PREPARED_ITEM_TOO_LARGE")
            additional = sum(len(v) + len(k.encode()) * 2 + 100 for k, v in additions.items())
            if additional > MAX_BATCH:
                raise ValueError("POST_TOO_LARGE_SPLIT_REQUIRES_REVIEW")
            if size + additional > MAX_BATCH or len(posts) >= 50 or len(files) + len(additions) > 990:
                flush()
            files.update(additions)
            posts.append(key)
            size += additional
        if observed != set(prior_rows):
            raise ValueError("SOURCE_CHANGED_SINCE_INSPECTION")
        flush()
    (output / "review-report.json").write_bytes(encoded(report))
    return {"reportSha256": report_hash, "htmlFiles": len(report["items"]), "eligible": sum(p["eligible"] for p in report["items"]),
            "batches": len(report["batches"]), "committedPosts": 0, "officialExportCompatibility": COMPATIBILITY}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--prepare", action="store_true")
    parser.add_argument("--report-sha256")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.source, args.output, args.prepare, args.report_sha256)))
    except (ValueError, OSError) as error:
        # No content, local paths, passwords or private parser input in diagnostics.
        print(json.dumps({"status": "FAILED", "code": str(error) if isinstance(error, ValueError) and re.fullmatch("[A-Z_]+", str(error)) else "LOCAL_PREPARATION_FAILED"}))
        raise SystemExit(1)
