"""Offline, bounded native HTML review adapter. Never connects to Naver or imports.

Inspect: python scripts/naver_native_prepare.py SOURCE OUTPUT
Prepare only after inspecting: add --prepare --report-sha256 <printed report hash>
Original source bytes stay in SOURCE and in each prepared batch as private assets.
Recognized native backups are inspected even when the importer cannot store
their original HTML or attachments at the current limits.
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
MAX_HTML_CHARS = 500_000
MAX_IMAGE_PIXELS = 24_000_000
NATIVE_IMAGE_BYTES = 12_000_000
NATIVE_IMAGE_PIXELS = 120_000_000
NATIVE_BATCH = 24_000_000
NATIVE_FORMAT = "orbit-naver-archive/native-v2"
MAX_BATCH = 7_500_000
MAX_FILES = 100_000
MAX_TOTAL = 2_000_000_000
COMPATIBILITY = "UNTESTED_PENDING_USER_ARCHIVE"
NAVER_FOLDER = re.compile(r"(\d{8})_(\d{12})_.+")
VOID_TAGS = frozenset("area base br col embed hr img input link meta param source track wbr".split())
HIDDEN_TAGS = {"script", "style", "template", "noscript"}


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


class NaverExportArticle(HTMLParser):
    """Read the exported SmartEditor document without evaluating its HTML."""

    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.title, self.categories, self.paragraphs, self.images = [], [], [], []
        self.components, self.embeds, self.meta = [], [], {}
        self.viewer_count = self.main_count = self.title_count = self.link_count = 0
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = set((a.get("class") or "").split())
        _, viewer, main, field, hidden = self.stack[-1] if self.stack else ("", False, False, None, False)
        hidden = hidden or tag in HIDDEN_TAGS
        if tag == "meta" and any(frame[0] == "head" for frame in self.stack):
            self.meta[(a.get("property") or a.get("name") or "").lower()] = a.get("content") or ""
        if tag == "div" and "se-viewer" in classes:
            viewer = True
            self.viewer_count += 1
        if viewer and tag == "div" and "se-main-container" in classes:
            main = True
            self.main_count += 1
        if viewer and "se-title-text" in classes:
            field = self.title
            self.title_count += 1
        if tag == "p" and classes.intersection({"ugc-backup-category", "ugc-backup-category-cover"}):
            field = []
            self.categories.append(field)
        if main and "se-component" in classes:
            component = next((c for c in sorted(classes) if re.fullmatch(r"se-[A-Za-z][A-Za-z0-9]*", c)
                              and c != "se-component"), "se-unknown")
            self.components.append(component)
        if main and tag == "p" and "se-text-paragraph" in classes:
            field = []
            self.paragraphs.append(field)
        if viewer and not hidden and tag == "img":
            self.images.append(a.get("src") or "")
        if main and not hidden and tag in {"iframe", "video", "audio", "source", "embed", "object"}:
            self.embeds.append({"tag": tag, "reference": a.get("src") or a.get("data") or ""})
        if main and not hidden and tag == "a" and a.get("href"):
            self.link_count += 1
        if tag == "br" and not hidden and field is not None:
            field.append("\n")
        if tag not in VOID_TAGS:
            self.stack.append((tag, viewer, main, field, hidden))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for idx in range(len(self.stack) - 1, -1, -1):
            if self.stack[idx][0] == tag:
                del self.stack[idx:]
                return

    def handle_data(self, data):
        if self.stack:
            _, _, _, field, hidden = self.stack[-1]
            if field is not None and not hidden:
                field.append(data)

    @property
    def recognized(self):
        return self.viewer_count == self.main_count == self.title_count == 1


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


def image_size(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n") and data[12:16] == b"IHDR" and len(data) >= 24:
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if data.startswith(b"\xff\xd8\xff"):
        index = 2
        while index < len(data) and data[index] == 0xff:
            while index < len(data) and data[index] == 0xff:
                index += 1
            if index + 3 > len(data):
                break
            marker, index = data[index], index + 1
            if marker in {0xd9, 0xda}:
                break
            if marker == 1 or 0xd0 <= marker <= 0xd7:
                continue
            length = int.from_bytes(data[index:index + 2], "big")
            if length < 2 or index + length > len(data):
                break
            if marker in {0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf} and length >= 8:
                return int.from_bytes(data[index + 5:index + 7], "big"), int.from_bytes(data[index + 3:index + 5], "big")
            index += length
    raise ValueError("UNSUPPORTED_MEDIA")


def native_media(path, refs, native_v2):
    assets, files, inventory, blockers = [], {}, [], set()
    seen = set()
    byte_limit = NATIVE_IMAGE_BYTES if native_v2 else MAX_FILE
    pixel_limit = NATIVE_IMAGE_PIXELS if native_v2 else MAX_IMAGE_PIXELS
    for ref in refs:
        item = {"reference": ref}
        inventory.append(item)
        try:
            parsed = urlsplit(ref)
            if parsed.scheme in {"http", "https"} or parsed.netloc:
                item["status"] = "REMOTE_NOT_FETCHED"
                continue
            local_path = unquote(parsed.path)
            if (not ref or parsed.scheme or parsed.query or parsed.fragment or local_path.startswith("/") or
                    "\\" in local_path or ":" in local_path or len(ref) > 1000):
                raise ValueError("UNSAFE_IMAGE_REFERENCE")
            source = path.parent / local_path
            if source.is_symlink() or not source.resolve().is_relative_to(path.parent.resolve()):
                raise ValueError("UNSAFE_IMAGE_REFERENCE")
            if not source.is_file():
                raise ValueError("MISSING_IMAGE")
            item["bytes"] = source.stat().st_size
            exceeds_limit = item["bytes"] > byte_limit
            with source.open("rb") as image:
                if exceeds_limit:
                    item["sha256"] = hashlib.file_digest(image, "sha256").hexdigest()
                else:
                    data = image.read(byte_limit + 1)
                    exceeds_limit = len(data) > byte_limit
                    if not exceeds_limit:
                        item.update(bytes=len(data), sha256=sha(data))
            if exceeds_limit:
                raise ValueError("IMAGE_FILE_SIZE_LIMIT")
            width, height = image_size(data)
            item.update(width=width, height=height)
            if width <= 0 or height <= 0 or width * height > pixel_limit:
                raise ValueError("IMAGE_PIXEL_LIMIT")
            item["status"] = "DOWNLOAD_ONLY_IMAGE" if width * height > MAX_IMAGE_PIXELS else "LOCAL_IMAGE"
            if ref not in seen:
                asset_id = str(uuid.uuid5(uuid.NAMESPACE_URL, path.parent.name + "|" + ref + "|" + item["sha256"]))
                name = "assets/" + asset_id
                asset = {"id": asset_id, "path": name, "sourceRef": ref}
                if native_v2:
                    asset["sha256"] = item["sha256"]
                assets.append(asset)
                files[name] = data
                seen.add(ref)
        except (ValueError, OSError) as exc:
            code = str(exc)
            item["status"] = code if re.fullmatch("[A-Z_]+", code) else "IMAGE_READ_FAILED"
            if item["status"] in {"IMAGE_FILE_SIZE_LIMIT", "IMAGE_PIXEL_LIMIT"}:
                blockers.add(item["status"])
    return assets, files, inventory, sorted(blockers)


def inspect(root, native_v2=False):
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
            native_folder = NAVER_FOLDER.fullmatch(path.parent.name) if path.name.lower() == "index.html" else None
            if native_folder:
                native = NaverExportArticle(html)
                if native.recognized:
                    yield inspect_native(path, row, native, native_folder, data, html, encoding, native_v2)
                    continue
            if native_v2:
                raise ValueError("UNRECOGNIZED_NATIVE_BACKUP_LAYOUT")
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


def inspect_native(path, row, native, folder, data, html, encoding, native_v2):
    title = "".join(native.title).strip()
    categories = {"".join(parts).strip() for parts in native.categories}
    categories.discard("")
    category = next(iter(categories)) if len(categories) == 1 else None
    paragraphs = ["".join(parts) for parts in native.paragraphs]
    body = "\n".join(paragraphs)
    def units(text):
        # The server's Java String limit counts UTF-16 code units.
        return len(text.encode("utf-16-le")) // 2

    assets, media, image_inventory, blockers = native_media(path, native.images, native_v2)
    source_hash = sha(data)
    row.update(layout="NAVER_SMARTEDITOR_EXPORT", externalPostId=folder[2], folderDateHint=folder[1],
               category=category, sourceSha256=source_hash, encoding=encoding, htmlBytes=len(data),
               htmlUtf16=units(html), bodyUtf16=units(body), bodySha256=sha(body.encode("utf-8")),
               paragraphs=len(paragraphs), components=native.components, mediaEmbeds=native.embeds,
               links=native.link_count, images=len(assets), media=image_inventory)
    row["warnings"].append("TEXT_EXTRACTED_FROM_HTML_REVIEW_REQUIRED")
    row["warnings"].extend(sorted({i["status"] for i in image_inventory if i["status"] != "LOCAL_IMAGE"}))
    if any(key != "se-text" for key in native.components):
        row["warnings"].append("NON_TEXT_COMPONENTS_REQUIRE_SOURCE_REVIEW")
    if native.embeds:
        row["warnings"].append("EMBEDDED_MEDIA_NOT_FETCHED")
    if not native_v2 and row["htmlUtf16"] > MAX_HTML_CHARS:
        blockers.append("SOURCE_HTML_FIELD_LIMIT")
    if not title or units(title) > 500 or not body.strip() or row["bodyUtf16"] > MAX_HTML_CHARS:
        blockers.append("TITLE_OR_BODY_UNSUPPORTED")
    if category and units(category) > 200:
        blockers.append("CATEGORY_FIELD_LIMIT")
    if len(assets) > 20:
        blockers.append("POST_IMAGE_LIMIT")
    if not category:
        row["warnings"].append("CONFLICTING_CATEGORY" if categories else "UNKNOWN_CATEGORY")
    date = native.meta.get("article:published_time") or None
    if date:
        try:
            if not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)", date):
                raise ValueError
            datetime.fromisoformat(date)
        except ValueError:
            date = None
            row["warnings"].append("UNPARSED_DATE")
    if not date:
        row["warnings"].append("UNKNOWN_DATE")
    url = native.meta.get("og:url") or None
    if url and not re.fullmatch(
            rf"https://(?:m\.)?blog\.naver\.com/(?:[^/?#]+/{folder[2]}/?|PostView\.naver\?logNo={folder[2]})", url):
        url = None
        row["warnings"].append("UNRECOGNIZED_SOURCE_URL")
    row.update(originalPublishedAt=date, originalUrl=url, blockers=blockers, eligible=not blockers)
    if blockers:
        return row, None, {}
    original = "originals/" + source_hash + ".bin"
    post = {key: row[key] for key in ("externalPostId", "originalPublishedAt", "originalUrl")}
    post.update(title=title, bodyText=body, sourceHtml=html, sourceCategory=category, sourceVisibility="UNKNOWN",
                fidelityStatus="NEEDS_REVIEW", assets=assets,
                sourceArtifact={"path": original, "sha256": source_hash, "encoding": encoding})
    if native_v2:
        del post["sourceHtml"]  # Raw bytes are supplied exactly once in sourceArtifact.
    files = {original: data, **media}
    post_json = encoded(post)
    batch_limit = NATIVE_BATCH - 100_000 if native_v2 else MAX_BATCH
    if len(post_json) > MAX_FILE or len(post_json) + sum(map(len, files.values())) > batch_limit:
        row.update(eligible=False, blockers=["PREPARED_ITEM_SIZE_LIMIT"])
        return row, None, {}
    return row, post, files


def run(source, output, prepare=False, approval=None, native_v2=False):
    source, output = Path(source).resolve(strict=True), Path(output).resolve()
    if output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("OUTPUT_MUST_BE_SEPARATE_FROM_SOURCE")
    # Refuse reuse: completed chunks are immutable and cannot be overwritten.
    output.mkdir(parents=True, exist_ok=False)
    report = {"format": "native-html-review/v1", "officialExportCompatibility": COMPATIBILITY,
              "committedPosts": 0, "items": [], "batches": []}
    archive_format = NATIVE_FORMAT if native_v2 else "orbit-naver-archive/v1"
    if native_v2:
        report["preparedFormat"] = archive_format
    # First pass stores bounded metadata only. Never retains the whole export in RAM.
    for row, _, _ in inspect(source, native_v2):
        report["items"].append(row)
    report_hash = sha(encoded({"format": archive_format, "items": report["items"]} if native_v2 else report["items"]))
    report["reportSha256"] = report_hash
    if prepare:
        if approval != report_hash:
            raise ValueError("EXACT_INSPECTION_REPORT_APPROVAL_REQUIRED")
        files, posts, size = {}, [], 0

        def flush():
            nonlocal files, posts, size
            if not posts:
                return
            files["manifest.json"] = encoded({"format": archive_format, "posts": posts,
                "adapter": "native-html-review/v1", "reviewReportSha256": report_hash})
            extension = ".orbit-native.zip" if native_v2 else ".zip"
            name = "batch-%05d%s" % (len(report["batches"]) + 1, extension)
            target = output / name
            with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_STORED) as archive:
                for key, value in files.items():
                    entry = zipfile.ZipInfo(key, date_time=(1980, 1, 1, 0, 0, 0))
                    entry.compress_type = zipfile.ZIP_STORED
                    archive.writestr(entry, value)
            if target.stat().st_size > (NATIVE_BATCH if native_v2 else 8_000_000):
                raise ValueError("BATCH_LIMIT")
            report["batches"].append({"file": name, "sha256": sha(target.read_bytes()), "posts": len(posts), "bytes": target.stat().st_size})
            files, posts, size = {}, [], 0

        prior_rows = {p["path"]: p for p in report["items"]}
        external_ids = [p["externalPostId"] for p in prior_rows.values() if p.get("externalPostId")]
        if len(set(external_ids)) != len(external_ids):
            raise ValueError("DUPLICATE_EXPORT_POST_ID_REQUIRES_REVIEW")
        observed = set()
        batch_limit = NATIVE_BATCH - 100_000 if native_v2 else MAX_BATCH
        for row, post, assets in inspect(source, native_v2):
            observed.add(row["path"])
            prior = prior_rows.get(row["path"])
            if row != prior:
                raise ValueError("SOURCE_CHANGED_SINCE_INSPECTION")
            if post is None:
                continue
            key = "posts/" + sha(row["path"].encode()) + ".json"
            additions = {key: encoded(post), **assets}
            if any(len(v) > (NATIVE_IMAGE_BYTES if native_v2 and k.startswith("assets/") else MAX_FILE)
                   for k, v in additions.items()):
                raise ValueError("PREPARED_ITEM_TOO_LARGE")
            additional = sum(len(v) + len(k.encode()) * 2 + 100 for k, v in additions.items())
            if additional > batch_limit:
                raise ValueError("POST_TOO_LARGE_SPLIT_REQUIRES_REVIEW")
            if size + additional > batch_limit or len(posts) >= 50 or len(files) + len(additions) > 990:
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
    parser.add_argument("--native-v2", action="store_true", help="Use the private chunked upload format.")
    parser.add_argument("--report-sha256")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.source, args.output, args.prepare, args.report_sha256, args.native_v2)))
    except (ValueError, OSError) as error:
        # No content, local paths, passwords or private parser input in diagnostics.
        print(json.dumps({"status": "FAILED", "code": str(error) if isinstance(error, ValueError) and re.fullmatch("[A-Z_]+", str(error)) else "LOCAL_PREPARATION_FAILED"}))
        raise SystemExit(1)
