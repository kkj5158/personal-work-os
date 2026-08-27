package com.kafka.backend.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Production security configuration: every {@code /api/**} request must
 * carry a valid Supabase-issued JWT (signature, expiration, and issuer all
 * verified — see {@link #jwtDecoder}); {@code /actuator/health} stays
 * public for platform health checks. {@code @Profile("prod")} restricted —
 * dev uses {@link DevSecurityConfig} (no authentication) instead.
 * <p>
 * The verified JWT's {@code sub} claim becomes the current user id via
 * {@link ProdCurrentUserProvider} — every existing ownership check
 * downstream is unchanged, since it already only ever trusts
 * {@link CurrentUserProvider}, never a client-supplied id.
 */
@Configuration
@EnableWebSecurity
@Profile("prod")
public class ProdSecurityConfig {

    private final String jwksUri;
    private final String issuer;
    private final List<String> allowedOrigins;

    public ProdSecurityConfig(
            @Value("${app.supabase.jwks-uri}") String jwksUri,
            @Value("${app.supabase.issuer}") String issuer,
            @Value("${app.cors.allowed-origins}") List<String> allowedOrigins
    ) {
        this.jwksUri = jwksUri;
        this.issuer = issuer;
        this.allowedOrigins = allowedOrigins;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().denyAll()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.decoder(jwtDecoder())));
        return http.build();
    }

    /**
     * Explicit signature (via the project's own JWKS — Supabase's
     * asymmetric ES256 signing key), expiration, and issuer validation.
     * Built manually (rather than {@code spring.security.oauth2
     * .resourceserver.jwt.issuer-uri}, which triggers OIDC discovery) so
     * only the JWKS endpoint is ever called, with no assumption that
     * Supabase exposes a full OIDC discovery document.
     */
    @Bean
    public JwtDecoder jwtDecoder() {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwksUri).build();
        OAuth2TokenValidator<Jwt> withIssuer =
                JwtValidators.createDefaultWithValidators(new JwtTimestampValidator(), new JwtIssuerValidator(issuer));
        decoder.setJwtValidator(withIssuer);
        return decoder;
    }

    private CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
