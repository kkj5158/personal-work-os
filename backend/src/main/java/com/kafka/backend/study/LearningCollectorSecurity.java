package com.kafka.backend.study;

import java.util.Set;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

/** Only these four exchanges accept a scoped collector capability, verified under lock in LearningActivity. */
@Configuration
class LearningCollectorSecurity {
    static final Set<String> ROUTES=Set.of("/api/study/activity/bind","/api/study/activity/events/batch",
        "/api/study/activity/heartbeat","/api/study/activity/revoke");
    @Bean @Order(-3)
    SecurityFilterChain learningCollectorChain(HttpSecurity http) throws Exception {
        return http.securityMatcher(r->ROUTES.contains(r.getServletPath()) ||
                (r.getHeader("Authorization")!=null && r.getHeader("Authorization").startsWith("StudyCollector ")))
            .csrf(c->c.disable()).requestCache(c->c.disable())
            .sessionManagement(c->c.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(c->c.requestMatchers(r->"POST".equals(r.getMethod()) && ROUTES.contains(r.getServletPath()) &&
                r.getHeader("Authorization")!=null && r.getHeader("Authorization").matches("StudyCollector [a-f0-9]{64}")).permitAll()
                .anyRequest().denyAll()).build();
    }
}
