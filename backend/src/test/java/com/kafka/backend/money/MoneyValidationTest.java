package com.kafka.backend.money;

import com.kafka.backend.common.InvalidRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MoneyValidationTest {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final MoneyService service=new MoneyService(db,UUID::randomUUID,JsonMapper.builder().build());
    @Test void invalidNotificationsNeverReachDatabase() {
        for(var payload: List.<Map<String,Object>>of(Map.of(),Map.of("postedAt","bad","text","hello"),
                Map.of("postedAt","2026-09-24T05:00:00Z","text",123),
                Map.of("postedAt","2026-09-24T05:00:00Z","text","hello","sourcePackage",List.of("bad")),
                Map.of("postedAt","2026-09-24T05:00:00Z","text"," "),
                Map.of("postedAt","2026-09-24T05:00:00Z","text","hello","extra","가".repeat(50000)))) {
            assertThatThrownBy(()->service.ingest(payload)).isInstanceOf(InvalidRequestException.class);
        }
        verifyNoInteractions(db);
    }
    @Test void accountRegistrationRejectsFullAccountNumbersAndMissingRole() {
        assertThatThrownBy(()->service.createAccount(new AccountInput("IBK","Test",AccountRole.SPENDING,"97512345601014",null))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.createAccount(new AccountInput("IBK","Test",AccountRole.SPENDING,null,"123456"))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->service.createAccount(new AccountInput("IBK","Test",null,null,null))).isInstanceOf(InvalidRequestException.class);
        verifyNoInteractions(db);
    }
}
