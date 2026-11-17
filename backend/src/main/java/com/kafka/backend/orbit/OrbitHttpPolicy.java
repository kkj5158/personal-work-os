package com.kafka.backend.orbit;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

/** Runs before security so even 401/403 responses cannot be cached. */
@Component
@Order(-110)
public class OrbitHttpPolicy extends OncePerRequestFilter {
    @Override protected boolean shouldNotFilter(HttpServletRequest r) { return !r.getRequestURI().startsWith("/api/orbit/context/")&&!r.getRequestURI().startsWith(com.kafka.backend.workflow.attention.AttentionManagementRoutes.PREFIX); }
    @Override protected void doFilterInternal(HttpServletRequest r, HttpServletResponse s, FilterChain chain) throws ServletException, IOException {
        s.setHeader("Cache-Control", "private, no-store");
        s.setHeader("Pragma", "no-cache");
        s.setHeader("X-Content-Type-Options", "nosniff");
        chain.doFilter(r, s);
        s.setHeader("Cache-Control", "private, no-store");
        if ((s.getStatus() == 401 || s.getStatus() == 403) && !s.isCommitted() && s.getContentType() == null) {
            s.setContentType("application/json");
            s.getWriter().write(s.getStatus() == 401 ? "{\"message\":\"User authentication required\"}" : "{\"message\":\"Forbidden\"}");
        }
    }
}
