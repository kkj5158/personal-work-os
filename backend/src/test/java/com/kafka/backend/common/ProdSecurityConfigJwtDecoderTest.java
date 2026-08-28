package com.kafka.backend.common;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Regression coverage for the PROD ES256 JWT verification bug:
 * {@code NimbusJwtDecoder.withJwkSetUri(...).build()} silently trusts only
 * RS256 unless {@code .jwsAlgorithm(...)} is called explicitly — Supabase
 * signs with ES256, so every real production token was rejected with
 * "Another algorithm expected, or no matching key(s) found" before
 * {@link ProdSecurityConfig#jwtDecoder()} started pinning the algorithm.
 * <p>
 * Runs an actual {@link NimbusJwtDecoder} built by {@link ProdSecurityConfig}
 * against a local, in-process JWKS endpoint (JDK's built-in
 * {@link HttpServer} — no new test dependency) and real ES256/RS256-signed
 * tokens, so this exercises the exact same code path as production rather
 * than re-describing the fix.
 */
class ProdSecurityConfigJwtDecoderTest {

    private static final String ISSUER = "https://test-project.supabase.co/auth/v1";

    private HttpServer jwksServer;
    private String jwksUri;
    private ECKey ecKey;
    private RSAKey rsaKey;

    @BeforeEach
    void startJwksServer() throws Exception {
        ecKey = new ECKeyGenerator(Curve.P_256).keyID("ec-key-1").generate();
        rsaKey = new RSAKeyGenerator(2048).keyID("rsa-key-1").generate();

        // Both a real EC key (what Supabase actually uses) and a real RSA
        // key are published, so the RS256-rejection test below proves the
        // decoder is restricted by *algorithm*, not merely failing to find
        // any matching key at all.
        JWKSet publicJwks = new JWKSet(List.of(ecKey.toPublicJWK(), rsaKey.toPublicJWK()));
        byte[] body = publicJwks.toString().getBytes(StandardCharsets.UTF_8);

        jwksServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwksServer.createContext("/jwks", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        jwksServer.start();
        jwksUri = "http://127.0.0.1:" + jwksServer.getAddress().getPort() + "/jwks";
    }

    @AfterEach
    void stopJwksServer() {
        jwksServer.stop(0);
    }

    /** Builds the decoder exactly the way ProdSecurityConfig does in
     *  production — the fix under test lives entirely inside jwtDecoder(),
     *  so this must call the real method, not a re-implementation of it. */
    private JwtDecoder decoder() {
        ProdSecurityConfig config = new ProdSecurityConfig(jwksUri, ISSUER, List.of("http://localhost:3000"));
        return config.jwtDecoder();
    }

    private String signedToken(JWSAlgorithm algorithm, Object signingKey, String keyId, String issuer, UUID subject) throws JOSEException {
        JWSHeader header = new JWSHeader.Builder(algorithm).keyID(keyId).build();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(subject.toString())
                .issuer(issuer)
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now().plusSeconds(3600)))
                .build();
        SignedJWT jwt = new SignedJWT(header, claims);
        if (signingKey instanceof ECKey ec) {
            jwt.sign(new ECDSASigner(ec));
        } else if (signingKey instanceof RSAKey rsa) {
            jwt.sign(new RSASSASigner(rsa));
        } else {
            throw new IllegalArgumentException("Unsupported signing key type");
        }
        return jwt.serialize();
    }

    @Test
    void acceptsARealSupabaseStyleEs256Token() throws Exception {
        UUID subject = UUID.randomUUID();
        String token = signedToken(JWSAlgorithm.ES256, ecKey, ecKey.getKeyID(), ISSUER, subject);

        Jwt decoded = decoder().decode(token);

        assertThat(decoded.getSubject()).isEqualTo(subject.toString());
    }

    @Test
    void stillRejectsAnRs256TokenEvenWhenAValidRsaKeyExistsInTheSameJwks() throws Exception {
        String token = signedToken(JWSAlgorithm.RS256, rsaKey, rsaKey.getKeyID(), ISSUER, UUID.randomUUID());

        assertThatThrownBy(() -> decoder().decode(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void issuerValidationStillRejectsAValidlySignedEs256TokenFromADifferentIssuer() throws Exception {
        String token = signedToken(JWSAlgorithm.ES256, ecKey, ecKey.getKeyID(), "https://some-other-project.supabase.co/auth/v1", UUID.randomUUID());

        assertThatThrownBy(() -> decoder().decode(token)).isInstanceOf(JwtException.class);
    }
}
