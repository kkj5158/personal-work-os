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
    @Override protected boolean shouldNotFilter(HttpServletRequest r) { return !r.getRequestURI().startsWith("/api/orbit/context/"); }
    @Override protected void doFilterInternal(HttpServletRequest r, HttpServletResponse s, FilterChain chain) throws ServletException, IOException {
        s.setHeader("Cache-Control", "private, no-store");
        s.setHeader("Pragma", "no-cache");
        s.setHeader("X-Content-Type-Options", "nosniff");
        chain.doFilter(r, s);
        s.setHeader("Cache-Control", "private, no-store");
    }
}
