package com.kafka.backend.diet;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.HandlerInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Resolve the already verified identity before domain transactions reserve a connection.
 * Concurrent first-screen reads must not exhaust a small pool with nested mirror transactions. */
@Component @Profile({"prod", "hosted-dev"})
@ConditionalOnProperty(name="app.auth.mirror.enabled", havingValue="true")
public class DietMobileIdentityPreflight implements WebMvcConfigurer, HandlerInterceptor {
    private final CurrentUserProvider users;
    public DietMobileIdentityPreflight(CurrentUserProvider users) { this.users=users; }
    @Override public boolean preHandle(HttpServletRequest request,HttpServletResponse response,Object handler) {
        users.getCurrentUserId(); return true;
    }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/diet/mobile/**", "/api/diet/notes/**", "/api/diet/camera-media/**", "/api/diet/checks");
    }
}
