package com.kafka.backend.pos;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PosPreferencesControllerTest {
    @Test void writesAreUserScopedAndResetPersistsEmptyOrder() {
        var db = mock(JdbcTemplate.class);
        UUID owner = UUID.randomUUID();
        var controller = new PosPreferencesController(db, () -> owner);
        var ids = List.of("notes", "work", "future-system");
        assertThat(controller.save(new PosPreferencesController.Order(ids)).systemIds()).isEqualTo(ids);
        verify(db).update(contains("on conflict(owner_id)"), eq(owner), eq("notes,work,future-system"));
        controller.save(new PosPreferencesController.Order(List.of()));
        verify(db).update(contains("on conflict(owner_id)"), eq(owner), eq(""));
    }
    @Test void malformedPreferencesNeverReachDatabase() {
        var db = mock(JdbcTemplate.class);
        var controller = new PosPreferencesController(db, UUID::randomUUID);
        for (var ids : List.of(List.of("work", "work"), List.of("../notes"), List.of("work,notes"), List.of("")))
            assertThatThrownBy(() -> controller.save(new PosPreferencesController.Order(ids))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(() -> controller.save(new PosPreferencesController.Order(null))).isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(db);
    }
}
