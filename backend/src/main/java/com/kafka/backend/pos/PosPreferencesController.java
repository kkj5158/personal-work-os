package com.kafka.backend.pos;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.InvalidRequestException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/pos/preferences/system-order")
public class PosPreferencesController {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public PosPreferencesController(JdbcTemplate db, CurrentUserProvider users) { this.db = db; this.users = users; }
    public record Order(List<String> systemIds) {}
    @GetMapping public Order get() {
        var rows = db.query("select system_ids from pos_system_order where owner_id=?",
                (r, n) -> r.getString(1), users.getCurrentUserId());
        return new Order(rows.isEmpty() || rows.getFirst().isEmpty() ? List.of() : List.of(rows.getFirst().split(",")));
    }
    @PutMapping public Order save(@RequestBody Order order) {
        validate(order);
        db.update("insert into pos_system_order(owner_id,system_ids) values(?,?) on conflict(owner_id) do update set system_ids=excluded.system_ids,updated_at=now()",
                users.getCurrentUserId(), String.join(",", order.systemIds()));
        return order;
    }
    static void validate(Order order) {
        if (order == null || order.systemIds() == null || order.systemIds().size() > 100
                || order.systemIds().stream().anyMatch(id -> id == null || !id.matches("[a-z][a-z0-9-]{0,63}"))
                || new HashSet<>(order.systemIds()).size() != order.systemIds().size())
            throw new InvalidRequestException("시스템 순서를 확인하세요.");
    }
}
