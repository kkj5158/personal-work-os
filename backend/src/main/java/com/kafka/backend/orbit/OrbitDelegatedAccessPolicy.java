package com.kafka.backend.orbit;

import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.util.*;
import java.util.stream.Collectors;

/** OAuth-delegated sessions never inherit the normal POS application's write/API surface. */
public final class OrbitDelegatedAccessPolicy {
    private final Set<String> clients;
    private static final Set<String> ROUTES=Set.of(
        "get_sleep_context","get_recovery_context","get_diet_context","get_diet_daily_context","get_diet_progress_context",
        "get_calendar_context","get_work_records_context","get_checklist_catalog_context","get_checklist_records_context",
        "get_workflow_projects_context","get_workflow_tasks_context","get_workflow_day_context","get_workflow_plan_context",
        "get_workflow_waiting_context","get_money_overview_context","get_money_transactions_context","get_money_accounts_context",
        "get_money_loans_context","get_money_savings_context","get_money_earnings_context");
    public OrbitDelegatedAccessPolicy(String configured) {
        clients=Arrays.stream(configured.split(",")).map(String::trim).filter(s->!s.isEmpty()).collect(Collectors.toUnmodifiableSet());
        for(String client:clients)UUID.fromString(client);
    }
    public boolean allowed(Authentication auth,String method,String path) {
        if(!(auth instanceof JwtAuthenticationToken jwt)||!auth.isAuthenticated())return false;
        if(!jwt.getTokenAttributes().containsKey("client_id"))return true;
        Object client=jwt.getTokenAttributes().get("client_id");
        String prefix="/api/orbit/context/";
        return client instanceof String id&&clients.contains(id)&&"GET".equals(method)
            &&path.startsWith(prefix)&&ROUTES.contains(path.substring(prefix.length()));
    }
}
