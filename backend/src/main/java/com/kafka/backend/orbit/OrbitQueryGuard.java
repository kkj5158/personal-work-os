package com.kafka.backend.orbit;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.Set;

/** Fail closed before canonical readers materialize large histories. Internal table allowlist only. */
@Component
public class OrbitQueryGuard {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public OrbitQueryGuard(JdbcTemplate db, CurrentUserProvider users) { this.db=db; this.users=users; }
    private static final Set<String> OWNER = Set.of("diet_days", "diet_items", "diet_checks", "diet_challenges", "diet_challenge_items", "diet_global_goals", "diet_milestones", "diet_measurements", "checklist_archive_periods", "checklist_sys_identities", "checklist_sys_areas", "checklist_sys_items", "checklist_sys_records", "sleep_events", "sleep_sessions");
    private static final Set<String> USER = Set.of("planned_time_blocks", "work_records", "work_time_entries", "supplemental_work_entries", "life_time_entries", "life_state_entries", "attendance_plans", "money_workplaces", "money_coupang_work_records", "money_work_payments", "money_work_pay_weeks", "money_work_earnings_weeks", "projects", "work_tasks", "workpad_blocks", "work_task_plan_days", "money_accounts", "money_transactions", "money_parse_attempts", "money_loans");
    public void check(String... tables) {
        var owner = users.getCurrentUserId();
        for (String table : tables) {
            if (!OWNER.contains(table) && !USER.contains(table)) throw new IllegalArgumentException("Unknown context source");
            String column = OWNER.contains(table) ? "owner_id" : "user_id";
            Integer count = db.queryForObject("select count(*) from (select 1 from " + table + " where " + column + "=? limit 10001) bounded", Integer.class, owner);
            if (count != null && count > 10000) throw new OrbitResponseAdvice.LimitExceeded();
        }
    }
}
