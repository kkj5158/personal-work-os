package com.kafka.backend.calendar;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.function.Supplier;

/** Small durable replay store for Calendar creation only. The enclosing source write shares its transaction. */
@Component
public class CalendarCreationOperations {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule())
        .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    public CalendarCreationOperations(JdbcTemplate db, CurrentUserProvider users) { this.db=db; this.users=users; }

    @Transactional
    public <T> T execute(UUID key, String kind, Class<T> responseType, Supplier<T> create, Predicate<T> committed) {
        UUID user=users.getCurrentUserId();
        // Cross-instance serialization covers lookup, domain insert, and receipt insert together.
        db.query("select id from auth.users where id=? for update", rs->{}, user);
        if(key!=null) {
            var prior=db.query("select operation_kind, response_json from calendar_creation_operations where user_id=? and operation_id=?",
                (rs,n)->new Receipt(rs.getString(1),rs.getString(2)),user,key);
            if(!prior.isEmpty()) {
                if(!prior.getFirst().kind().equals(kind)) throw new InvalidRequestException("Idempotency-Key was already used for another Calendar operation.");
                try {return json.readValue(prior.getFirst().response(),responseType);}
                catch(java.io.IOException failure) {throw new IllegalStateException("Cannot read Calendar creation receipt",failure);}
            }
        }
        T response=create.get();
        if(key!=null && committed.test(response)) {
            try {db.update("insert into calendar_creation_operations(user_id,operation_id,operation_kind,response_json) values (?,?,?,?)",
                user,key,kind,json.writeValueAsString(response));}
            catch(com.fasterxml.jackson.core.JsonProcessingException failure) {throw new IllegalStateException("Cannot write Calendar creation receipt",failure);}
        }
        return response;
    }
    private record Receipt(String kind,String response) {}
}
