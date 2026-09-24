package com.kafka.backend.authoring;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.authoring.AuthoringTypes.*;

@Service
@Transactional
public class AuthoringService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    private final AuthoringDefinitions definitions;

    public AuthoringService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json, AuthoringDefinitions definitions) {
        this.db = db; this.users = users; this.json = json; this.definitions = definitions;
    }
    private UUID owner() { return users.getCurrentUserId(); }
    private static Instant instant(ResultSet row, String key) throws SQLException {
        var timestamp = row.getTimestamp(key); return timestamp == null ? null : timestamp.toInstant();
    }
    @SuppressWarnings("unchecked") private Map<String, Object> object(String value) {
        return value == null ? null : json.readValue(value, Map.class);
    }
    private Session row(ResultSet row, int number) throws SQLException {
        return new Session(row.getObject("id", UUID.class), row.getString("program_key"), row.getString("spec_version"),
                row.getString("status"), row.getString("current_section_key"), object(row.getString("answers")),
                object(row.getString("report")), row.getObject("source_session_id", UUID.class),
                instant(row, "started_at"), instant(row, "updated_at"), instant(row, "completed_at"),
                row.getLong("version"), json.readValue(row.getString("definition"), Definition.class),
                row.getString("title"), row.getString("memo"), definitions.title(row.getString("program_key")));
    }

    @Transactional(readOnly = true)
    public List<Summary> list() {
        return db.query("select id,program_key,spec_version,status,current_section_key,source_session_id,started_at,updated_at,completed_at,version,title,memo from authoring_sessions where user_id=? order by updated_at desc,id",
                (row, number) -> new Summary(row.getObject("id", UUID.class), row.getString("program_key"), row.getString("spec_version"),
                        row.getString("status"), row.getString("current_section_key"), row.getObject("source_session_id", UUID.class),
                        instant(row, "started_at"), instant(row, "updated_at"), instant(row, "completed_at"), row.getLong("version"),
                        row.getString("title"), row.getString("memo")), owner());
    }

    @Transactional(readOnly = true)
    public Session get(UUID id) {
        var rows = db.query("select * from authoring_sessions where id=? and user_id=?", this::row, id, owner());
        if (rows.isEmpty()) throw new ResourceNotFoundException("Authoring session not found");
        return rows.getFirst();
    }

    public Session create(CreateSession request) {
        var definition = definitions.current(request.programKey());
        if ("review".equals(definition.programKey()) && request.sourceSessionId() == null) {
            throw new InvalidRequestException("Review requires a completed Authoring source");
        }
        if (request.sourceSessionId() != null) {
            var source = get(request.sourceSessionId());
            boolean futureSource = "grounded-future".equals(definition.programKey()) && "reality".equals(source.programKey());
            boolean reviewSource = "review".equals(definition.programKey())
                    && Set.of("recovery", "reality", "present-life", "grounded-future", "past", "sexual-pattern", "responsibility").contains(source.programKey());
            if ((!futureSource && !reviewSource) || !"COMPLETED".equals(source.status())) {
                throw new InvalidRequestException("Choose a completed source supported by this Authoring program");
            }
        }
        UUID id = UUID.randomUUID();
        db.update("insert into authoring_sessions(id,user_id,program_key,spec_version,current_section_key,definition,source_session_id) values(?,?,?,?,?,cast(? as jsonb),?)",
                id, owner(), definition.programKey(), definition.version(), definition.sections().getFirst().sectionKey(),
                json.writeValueAsString(definition), request.sourceSessionId());
        return get(id);
    }

    public Session save(UUID id, SaveSession request) {
        var session = get(id);
        editable(session, request.expectedVersion());
        AuthoringAnswers.validate(session.definition(), request.currentSectionKey(), request.answers());
        String answers = json.writeValueAsString(request.answers());
        if (answers.length() > 2_000_000) throw new InvalidRequestException("Authoring answers are too large");
        int updated = db.update("update authoring_sessions set answers=cast(? as jsonb),current_section_key=?,title=?,memo=?,updated_at=current_timestamp,version=version+1 where id=? and user_id=? and version=? and status='IN_PROGRESS'",
                answers, request.currentSectionKey(), title(request.title()), memo(request.memo()), id, owner(), request.expectedVersion());
        changed(updated);
        return get(id);
    }

    /** Title and memo stay editable after completion; answers and the report snapshot are never touched. */
    public Session saveMetadata(UUID id, SaveMetadata request) {
        var session = get(id);
        if (request.expectedVersion() == null || request.expectedVersion() < 0) throw new InvalidRequestException("Expected version is required");
        if (session.version() != request.expectedVersion()) throw new OptimisticLockConflictException("This Authoring session changed. Reload before saving.");
        int updated = db.update("update authoring_sessions set title=?,memo=?,updated_at=current_timestamp,version=version+1 where id=? and user_id=? and version=?",
                title(request.title()), memo(request.memo()), id, owner(), request.expectedVersion());
        changed(updated);
        return get(id);
    }

    public Session complete(UUID id, CompleteSession request) {
        var session = get(id);
        editable(session, request.expectedVersion());
        AuthoringAnswers.validate(session.definition(), session.currentSectionKey(), session.answers());
        AuthoringAnswers.requireComplete(session.definition(), session.answers());
        Instant completedAt = Instant.now();
        var report = AuthoringReports.create(session, completedAt);
        if ("review".equals(session.programKey())) {
            var source = get(session.sourceSessionId());
            report.put("source", Map.of("id", source.id().toString(), "programKey", source.programKey(),
                    "completedAt", source.completedAt().toString(), "specVersion", source.specVersion()));
        }
        int updated = db.update("update authoring_sessions set status='COMPLETED',report=cast(? as jsonb),completed_at=?,updated_at=?,version=version+1 where id=? and user_id=? and version=? and status='IN_PROGRESS'",
                json.writeValueAsString(report), java.sql.Timestamp.from(completedAt), java.sql.Timestamp.from(completedAt), id, owner(), request.expectedVersion());
        changed(updated);
        return get(id);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> recoveryExport(UUID id) {
        var session = get(id);
        if (!"COMPLETED".equals(session.status()) || !"recovery".equals(session.programKey())) {
            throw new InvalidRequestException("Only a completed Recovery report can be exported");
        }
        @SuppressWarnings("unchecked") var export = (Map<String, Object>) session.report().get("recoveryExport");
        return export;
    }

    private static void editable(Session session, Long expectedVersion) {
        if (expectedVersion == null || expectedVersion < 0) throw new InvalidRequestException("Expected version is required");
        if (session.version() != expectedVersion) throw new OptimisticLockConflictException("This Authoring session changed. Reload before saving.");
        if (!"IN_PROGRESS".equals(session.status())) throw new InvalidRequestException("Completed Authoring sessions are immutable. Start a new session.");
    }
    private static String title(String value) {
        if (value == null || value.isBlank()) return null;
        if (value.length() > 200 || value.contains("\n") || value.contains("\r")) throw new InvalidRequestException("Session title must be one line of at most 200 characters");
        return value;
    }
    private static String memo(String value) {
        if (value == null || value.isBlank()) return null;
        if (value.length() > 5000) throw new InvalidRequestException("Session memo must be at most 5000 characters");
        return value;
    }
    private static void changed(int count) {
        if (count != 1) throw new OptimisticLockConflictException("This Authoring session changed. Reload before saving.");
    }
}
