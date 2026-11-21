package com.kafka.backend.naverarchive;

import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** One resumable, authenticated native ZIP upload per owner. */
@Service
public class ArchiveNativeUploads {
    static final int PART_BYTES = 750_000;
    private final ArchiveService archive;
    private final ArchiveImports imports;

    public ArchiveNativeUploads(ArchiveService archive, ArchiveImports imports) {
        this.archive = archive;
        this.imports = imports;
    }

    public Map<String, Object> upload(String sha, int index, Map<String, Object> body) {
        validateSha(sha);
        ArchiveService.keys(body, Set.of("totalBytes", "chunkBase64"));
        long length = ArchiveService.number(body.get("totalBytes"));
        if (length < 1 || length > ArchiveContent.NATIVE_ZIP_LIMIT || index < 0 ||
                index >= (length + PART_BYTES - 1) / PART_BYTES) {
            throw ArchiveService.error(400, "ZIP 크기 또는 조각 번호를 확인해주세요.");
        }
        int expected = (int)Math.min(PART_BYTES, length - (long)index * PART_BYTES);
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(ArchiveService.str(body, "chunkBase64", 1_000_000, true));
        } catch (IllegalArgumentException e) {
            throw ArchiveService.error(400, "조각 인코딩을 확인해주세요.");
        }
        if (bytes.length != expected) throw ArchiveService.error(400, "조각 길이가 다릅니다.");
        UUID owner = archive.owner();
        return archive.lock(owner, () -> {
            var existing = imports.priorPreview(owner, sha);
            if (existing != null && ArchiveImports.NATIVE_FORMAT.equals(existing.get("format"))) {
                return Map.of("state", "PREVIEW_READY", "manifestSha256", sha);
            }
            archive.db.update("delete from naver_archive_native_upload_parts where owner_id=? and expires_at<=now()", owner);
            var session = archive.db.queryForList("""
                    select archive_sha256,total_bytes,expires_at from naver_archive_native_upload_parts
                    where owner_id=? order by part_index limit 1
                    """, owner);
            if (!session.isEmpty() && (!sha.equals(session.getFirst().get("archive_sha256")) ||
                    ((Number)session.getFirst().get("total_bytes")).intValue() != length)) {
                throw ArchiveService.error(409, "진행 중인 다른 ZIP 전송을 완료하거나 취소해주세요.");
            }
            var prior = archive.db.queryForList(
                    "select bytes from naver_archive_native_upload_parts where owner_id=? and part_index=?", owner, index);
            if (!prior.isEmpty()) {
                if (!Arrays.equals(bytes, (byte[])prior.getFirst().get("bytes"))) {
                    throw ArchiveService.error(409, "같은 조각 번호의 내용이 다릅니다.");
                }
                return Map.of("state", "STAGED", "partIndex", index);
            }
            if (session.isEmpty()) {
                archive.db.update("""
                        insert into naver_archive_native_upload_parts(owner_id,archive_sha256,part_index,total_bytes,bytes,expires_at)
                        values(?,?,?,?,?,now()+interval '24 hours')
                        """, owner, sha, index, length, bytes);
            } else {
                archive.db.update("""
                        insert into naver_archive_native_upload_parts(owner_id,archive_sha256,part_index,total_bytes,bytes,expires_at)
                        values(?,?,?,?,?,?)
                        """, owner, sha, index, length, bytes, session.getFirst().get("expires_at"));
            }
            return Map.of("state", "STAGED", "partIndex", index);
        });
    }

    public Map<String, Object> preview(String sha) {
        validateSha(sha);
        UUID owner = archive.owner();
        return archive.lock(owner, () -> {
            var existing = imports.priorPreview(owner, sha);
            if (existing != null && ArchiveImports.NATIVE_FORMAT.equals(existing.get("format"))) return existing;
            var parts = archive.db.queryForList("""
                    select part_index,total_bytes,bytes from naver_archive_native_upload_parts
                    where owner_id=? and archive_sha256=? and expires_at>now() order by part_index
                    """, owner, sha);
            if (parts.isEmpty()) throw ArchiveService.error(404, "전송 중인 ZIP을 찾을 수 없습니다.");
            int count = ((Number)parts.getFirst().get("total_bytes")).intValue();
            if (parts.size() != (count + PART_BYTES - 1) / PART_BYTES) {
                throw ArchiveService.error(409, "전송이 끝나지 않았습니다. 같은 ZIP을 다시 선택해주세요.");
            }
            byte[] zip = new byte[count];
            for (int i = 0; i < parts.size(); i++) {
                var part = parts.get(i);
                byte[] bytes = (byte[])part.get("bytes");
                int offset = i * PART_BYTES;
                if (((Number)part.get("part_index")).intValue() != i ||
                        bytes.length != Math.min(PART_BYTES, count - offset)) {
                    throw ArchiveService.error(409, "ZIP 조각의 순서나 길이가 다릅니다.");
                }
                System.arraycopy(bytes, 0, zip, offset, bytes.length);
            }
            if (!sha.equals(ArchiveContent.hash(zip))) throw ArchiveService.error(400, "ZIP SHA-256이 일치하지 않습니다.");
            var result = imports.previewArchive(zip, true);
            archive.db.update("delete from naver_archive_native_upload_parts where owner_id=? and archive_sha256=?", owner, sha);
            return result;
        });
    }

    public Map<String, Object> active() {
        var rows = archive.db.queryForList("""
                select archive_sha256 from naver_archive_native_upload_parts
                where owner_id=? and expires_at>now() limit 1
                """, String.class, archive.owner());
        return rows.isEmpty() ? Map.of("state", "EMPTY") : Map.of("state", "STAGED", "manifestSha256", rows.getFirst());
    }

    public Map<String, Object> cancel(String sha) {
        validateSha(sha);
        UUID owner = archive.owner();
        return archive.lock(owner, () -> Map.of("discardedParts", archive.db.update(
                "delete from naver_archive_native_upload_parts where owner_id=? and archive_sha256=?", owner, sha)));
    }

    private void validateSha(String sha) {
        if (!sha.matches("[a-f0-9]{64}")) throw ArchiveService.error(400, "ZIP SHA-256을 확인해주세요.");
    }
}
