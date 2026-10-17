package com.kafka.backend.morning;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/** This narrow chain precedes unrelated service-token chains and dev permitAll. */
@Configuration
public class MorningVoiceSecurity {
    @Bean @Order(-100)
    SecurityFilterChain morningVoiceChain(HttpSecurity http, Environment environment,
                                          ObjectProvider<JwtDecoder> decoders) throws Exception {
        http.securityMatcher("/api/orbit/morning/v1/**")
                .csrf(c -> c.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(c -> c.disable())
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> unauthorized(res))
                        .accessDeniedHandler((req, res, ex) -> unauthorized(res)));
        if (environment.acceptsProfiles(Profiles.of("prod", "hosted-dev")) &&
                !environment.acceptsProfiles(Profiles.of("dev")) && decoders.getIfAvailable() != null) {
            http.authorizeHttpRequests(a -> a.anyRequest().authenticated())
                    .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoders.getObject()))
                            .authenticationEntryPoint((req, res, ex) -> unauthorized(res)));
        } else {
            // The fixed DevCurrentUserProvider is never an identity for billable voice.
            http.authorizeHttpRequests(a -> a.anyRequest().denyAll());
        }
        return http.build();
    }
    private static void unauthorized(jakarta.servlet.http.HttpServletResponse response) throws java.io.IOException {
        response.setStatus(401);
        response.setHeader("Cache-Control", "no-store");
        response.setContentType("application/json");
        response.getWriter().write("{\"code\":\"AUTHENTICATION_REQUIRED\",\"message\":\"Authenticated voice access is required\"}");
    }
}
