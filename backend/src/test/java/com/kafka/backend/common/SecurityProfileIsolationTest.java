package com.kafka.backend.common;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Locks in the pre-production auth fix's core safety property: the dev-only
 * fixed-user components (no login, ignores any Authorization header) must
 * never activate under the prod profile, and the real Supabase-JWT-backed
 * components must never activate under dev — see DevCurrentUserProvider /
 * ProdCurrentUserProvider's own @Profile annotations.
 */
class SecurityProfileIsolationTest {

    @Test
    void devProfileActivatesTheFixedUserProviderAndNeverTheJwtProvider() {
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("dev"))
                .withUserConfiguration(DevCurrentUserProvider.class, ProdCurrentUserProvider.class)
                .withPropertyValues("app.dev-user-id=" + UUID.randomUUID())
                .run(context -> {
                    assertThat(context).hasSingleBean(DevCurrentUserProvider.class);
                    assertThat(context).doesNotHaveBean(ProdCurrentUserProvider.class);
                });
    }

    @Test
    void prodProfileActivatesTheJwtProviderAndNeverTheFixedUserProvider() {
        new ApplicationContextRunner()
                .withInitializer(context -> context.getEnvironment().setActiveProfiles("prod"))
                .withUserConfiguration(DevCurrentUserProvider.class, ProdCurrentUserProvider.class)
                .withPropertyValues("app.dev-user-id=" + UUID.randomUUID())
                .run(context -> {
                    assertThat(context).hasSingleBean(ProdCurrentUserProvider.class);
                    assertThat(context).doesNotHaveBean(DevCurrentUserProvider.class);
                });
    }

    // DevSecurityConfig/ProdSecurityConfig each declare a SecurityFilterChain
    // @Bean that needs a full web ApplicationContext to construct (HttpSecurity
    // isn't available from a plain, non-web ApplicationContextRunner) — rather
    // than fight that with lazy-init tricks, verify the actual safety property
    // (the @Profile restriction on the class itself) directly, the same
    // mechanism Spring's own @Conditional evaluation reads.
    @Test
    void devSecurityConfigIsRestrictedToTheDevProfileOnly() {
        org.springframework.context.annotation.Profile profile =
                DevSecurityConfig.class.getAnnotation(org.springframework.context.annotation.Profile.class);
        assertThat(profile).isNotNull();
        assertThat(profile.value()).containsExactly("dev");
    }

    @Test
    void prodSecurityConfigIsRestrictedToTheProdProfileOnly() {
        org.springframework.context.annotation.Profile profile =
                ProdSecurityConfig.class.getAnnotation(org.springframework.context.annotation.Profile.class);
        assertThat(profile).isNotNull();
        assertThat(profile.value()).containsExactly("prod");
    }
}
