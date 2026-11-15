package com.kafka.backend.study;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Outbound worker token has no access to owner snapshots, source files, answers or other domains.
 */
@Configuration
class StudyWorkerSecurity {
  static final String PREFIX = "Bearer study_w2_";

  @Bean
  @Order(-1)
  SecurityFilterChain studyWorkerChain(HttpSecurity http, StudyEngine engine) throws Exception {
    http.securityMatcher(
            r ->
                r.getRequestURI().startsWith("/api/study-worker/")
                    || (r.getHeader("Authorization") != null
                        && r.getHeader("Authorization").startsWith(PREFIX)))
        .csrf(c -> c.disable())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .requestCache(c -> c.disable())
        .authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .addFilterBefore(
            new OncePerRequestFilter() {
              @Override
              protected void doFilterInternal(
                  HttpServletRequest r, HttpServletResponse s, FilterChain chain)
                  throws IOException, ServletException {
                s.setHeader("Cache-Control", "no-store");
                String auth = r.getHeader("Authorization");
                if (auth == null || !auth.startsWith(PREFIX)) {
                  s.setStatus(401);
                  return;
                }
                if (!r.getRequestURI().startsWith("/api/study-worker/")
                    || !r.getMethod().equals("POST")) {
                  s.setStatus(403);
                  return;
                }
                StudyEngineWorker worker;
                try {
                  worker = engine.authenticate(auth.substring(PREFIX.length()));
                } catch (StudyException e) {
                  s.setStatus(e.status);
                  return;
                }
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(
                    UsernamePasswordAuthenticationToken.authenticated(worker, null, List.of()));
                SecurityContextHolder.setContext(context);
                try {
                  chain.doFilter(r, s);
                } finally {
                  SecurityContextHolder.clearContext();
                }
              }
            },
            AnonymousAuthenticationFilter.class);
    return http.build();
  }
}
