package com.kafka.backend.common;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

/** DEV-only server credential: canonical Project read/create/patch, no other POS access. */
@Configuration
@Profile("hosted-dev")
public class WorkflowDevelopmentSecurity {
    public static final String PREFIX="Bearer tk_wf_dev_";
    private final byte[] expected;
    private final UUID owner;
    public WorkflowDevelopmentSecurity(@Value("${app.workflow-development.token-sha256:}") String hash,
        @Value("${app.workflow-development.owner-id}") String owner){
        this.expected=hash.isBlank()?new byte[0]:HexFormat.of().parseHex(hash);
        if(expected.length!=0&&expected.length!=32)throw new IllegalArgumentException("Invalid DEV integration credential configuration");
        this.owner=UUID.fromString(owner);
    }
    static boolean allowed(HttpServletRequest r){
        String path=r.getRequestURI();
        return ("GET".equals(r.getMethod())&&"/api/workflow/project-profiles".equals(path))
            ||("POST".equals(r.getMethod())&&"/api/workflow/projects".equals(path))
            ||("PATCH".equals(r.getMethod())&&path.matches("/api/workflow/projects/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"));
    }
    @Bean @Order(0)
    SecurityFilterChain workflowDevelopmentChain(HttpSecurity http)throws Exception{
        http.securityMatcher(r->{String h=r.getHeader("Authorization");return h!=null&&h.startsWith(PREFIX);})
            .csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable()).authorizeHttpRequests(a->a.anyRequest().authenticated())
            .addFilterBefore(new OncePerRequestFilter(){
                @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain)throws ServletException,IOException{
                    byte[] actual;
                    try{actual=MessageDigest.getInstance("SHA-256").digest(r.getHeader("Authorization").substring(7).getBytes(StandardCharsets.UTF_8));}
                    catch(Exception unavailable){s.setStatus(503);return;}
                    if(expected.length==0||!MessageDigest.isEqual(actual,expected)){s.setStatus(401);return;}
                    if(!allowed(r)){s.setStatus(403);return;}
                    SecurityContextHolder.getContext().setAuthentication(new ServiceAuthentication(owner));
                    try{chain.doFilter(r,s);}finally{SecurityContextHolder.clearContext();}
                }
            },AnonymousAuthenticationFilter.class);
        return http.build();
    }
    public static final class ServiceAuthentication extends AbstractAuthenticationToken{
        private final UUID owner;
        ServiceAuthentication(UUID owner){super(List.of());this.owner=owner;setAuthenticated(true);}
        public UUID ownerId(){return owner;}
        @Override public Object getPrincipal(){return owner;}
        @Override public Object getCredentials(){return "";}
    }
}
