package com.kafka.backend.money;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;
import java.io.IOException;

/** Narrow chain: device tokens cannot read money data or use any other POS API. Web JWT chain unchanged. */
@Configuration
@Profile({"dev","prod"})
public class MoneyBridgeSecurity {
    static boolean bridgeHeader(HttpServletRequest r){String h=r.getHeader("Authorization");return h!=null&&h.startsWith("Bearer mb1_");}
    static boolean path(HttpServletRequest r,String path){return (r.getContextPath()+path).equals(r.getRequestURI());}
    static boolean exchange(HttpServletRequest r){return path(r,"/api/money/bridge/exchange");}
    @Bean @Order(1)
    public SecurityFilterChain bridgeChain(HttpSecurity http,MoneyBridgeService service)throws Exception{
        http.securityMatcher(r->exchange(r)||bridgeHeader(r))
            .csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .requestCache(c->c.disable())
            .authorizeHttpRequests(a->a.requestMatchers(r->exchange(r)&&"POST".equals(r.getMethod())).permitAll()
                .requestMatchers(r->path(r,"/api/money/notifications")&&"POST".equals(r.getMethod())).authenticated()
                .anyRequest().denyAll())
            .exceptionHandling(e->e.authenticationEntryPoint((r,s,x)->s.setStatus(401)))
            .addFilterBefore(new OncePerRequestFilter(){
                @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain)throws ServletException,IOException{
                    BridgeAuthentication auth=null;
                    if(bridgeHeader(r)){
                        try{auth=service.authenticate(r.getHeader("Authorization").substring(7));}
                        catch(ResponseStatusException e){s.setStatus(401);return;}
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    }
                    try{chain.doFilter(r,s);}
                    finally{
                        if(auth!=null&&"POST".equals(r.getMethod())&&path(r,"/api/money/notifications"))service.receipt(auth,s.getStatus());
                    }
                }
            },AnonymousAuthenticationFilter.class);
        return http.build();
    }
}
