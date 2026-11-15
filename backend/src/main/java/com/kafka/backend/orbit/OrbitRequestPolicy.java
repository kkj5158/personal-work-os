package com.kafka.backend.orbit;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.*;

/** Authenticated, instance-local abuse limits, with bounded memory. No body logging. */
@Component
@Order(-90)
public class OrbitRequestPolicy extends OncePerRequestFilter {
    private record Window(long minute, int count) {}
    private final Map<String,Window> windows = new HashMap<>();
    private static Set<String> parameters(String route) {
        return switch (route) {
            case "get_sleep_context", "get_recovery_context" -> Set.of("timezone");
            case "get_workflow_projects_context", "get_workflow_tasks_context" -> Set.of("status", "limit", "offset");
            case "get_workflow_day_context" -> Set.of("date");
            case "get_money_earnings_context" -> Set.of("month");
            case "get_money_savings_context" -> Set.of("from", "to", "currency", "limit", "offset");
            case "get_money_transactions_context" -> Set.of("from", "to", "limit", "offset");
            case "get_checklist_catalog_context", "get_workflow_waiting_context", "get_money_accounts_context", "get_money_loans_context" -> Set.of();
            default -> Set.of("from", "to");
        };
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest r) { return !r.getRequestURI().startsWith("/api/orbit/context/"); }
    @Override protected void doFilterInternal(HttpServletRequest r, HttpServletResponse s, FilterChain chain) throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) { chain.doFilter(r,s); return; }
        String route = r.getRequestURI().substring(r.getRequestURI().lastIndexOf('/') + 1);
        var allowed = parameters(route);
        boolean invalid = r.getParameterMap().entrySet().stream().anyMatch(e -> !allowed.contains(e.getKey()) || e.getValue().length != 1 || e.getValue()[0].length() > 64);
        if (invalid || (r.getParameter("timezone") != null && !"Asia/Seoul".equals(r.getParameter("timezone")))) {
            reject(s, 400, "Invalid context parameter"); return;
        }
        if (!accept(authentication.getName(), System.currentTimeMillis() / 60000)) {
            s.setHeader("Retry-After", "60"); reject(s,429,"Context rate limit exceeded"); return;
        }
        chain.doFilter(r,s);
    }
    synchronized boolean accept(String owner, long minute) {
        windows.entrySet().removeIf(e -> e.getValue().minute() != minute);
        var previous = windows.get(owner);
        if (previous == null && windows.size() >= 10000) return false;
        int count = previous == null ? 0 : previous.count();
        if (count >= 60) return false;
        windows.put(owner,new Window(minute,count + 1)); return true;
    }
    private static void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json");
        response.getWriter().write("{\"message\":\"" + message + "\"}");
    }
}
