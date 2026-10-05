package com.kafka.backend.workflow.attention;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

/** Attention device and producer tokens are refused outside their exact allowlisted queue scope. */
@Configuration
@Profile({"dev","prod","hosted-dev"})
public class AttentionSecurity {
    private record Window(long minute,int count){}
    private final Map<UUID,Window> limits=new ConcurrentHashMap<>();
    private final Map<String,Window> exchangeLimits=new ConcurrentHashMap<>();
    static boolean exchange(HttpServletRequest r){return (r.getContextPath()+"/api/workflow/attention/device-exchange").equals(r.getRequestURI());}
    static boolean token(HttpServletRequest r){String h=r.getHeader("Authorization");return h!=null&&(h.startsWith("Bearer aqd_")||h.startsWith("Bearer aqp_"));}
    static boolean allowed(HttpServletRequest r,AttentionAuthentication auth){
        String path=r.getRequestURI().substring(r.getContextPath().length()),method=r.getMethod();
        String base="/api/workflow/attention";
        if(auth.producer())return "POST".equals(method)&&(path.equals(base+"/items")||path.equals(base+"/source-resolution"));
        if("GET".equals(method))return path.equals(base+"/snapshot")||path.equals(base+"/items")||path.matches(base+"/items/[0-9a-fA-F-]{36}");
        if("PATCH".equals(method))return path.matches(base+"/(items|lanes)/[0-9a-fA-F-]{36}");
        if("POST".equals(method))return path.equals(base+"/items")||path.equals(base+"/lanes")||path.equals(base+"/lanes/order")||path.matches(base+"/items/[0-9a-fA-F-]{36}/(complete|reopen|dismiss|seen|move|target)")||path.matches(base+"/lanes/[0-9a-fA-F-]{36}/remove");
        return false;
    }
    private boolean withinLimit(AttentionAuthentication auth){long minute=System.currentTimeMillis()/60000;var value=limits.compute(auth.credentialId(),(id,old)->old==null||old.minute()!=minute?new Window(minute,1):new Window(minute,old.count()+1));if(limits.size()>10000)limits.entrySet().removeIf(e->e.getValue().minute()<minute-1);return value.count()<=(auth.producer()?60:240);}
    @Bean @Order(2) public SecurityFilterChain attentionChain(HttpSecurity http,AttentionCredentials credentials)throws Exception{
        http.securityMatcher(r->exchange(r)||token(r)).csrf(c->c.disable()).sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS)).requestCache(c->c.disable())
            .authorizeHttpRequests(a->a.requestMatchers(r->exchange(r)&&"POST".equals(r.getMethod())&&!token(r)).permitAll().anyRequest().authenticated())
            .exceptionHandling(e->e.authenticationEntryPoint((r,s,x)->s.setStatus(401)).accessDeniedHandler((r,s,x)->s.setStatus(403)))
            .addFilterBefore(new OncePerRequestFilter(){@Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain)throws ServletException,IOException{
                if(exchange(r)){long minute=System.currentTimeMillis()/60000;String address=AttentionCredentials.hash(r.getRemoteAddr());var window=exchangeLimits.compute(address,(key,old)->old==null||old.minute()!=minute?new Window(minute,1):new Window(minute,old.count()+1));if(exchangeLimits.size()>10000)exchangeLimits.entrySet().removeIf(e->e.getValue().minute()<minute-1);if(window.count()>15){s.setStatus(429);s.setHeader("Retry-After","60");return;}}
                if(token(r)){AttentionAuthentication auth;try{auth=credentials.authenticate(r.getHeader("Authorization").substring(7));}catch(ResponseStatusException denied){s.setStatus(401);return;}
                    if(!allowed(r,auth)){s.setStatus(403);return;}if(!withinLimit(auth)){s.setHeader("Retry-After","60");s.setStatus(429);return;}
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
                try{chain.doFilter(r,s);}finally{if(token(r))SecurityContextHolder.clearContext();}
            }},AnonymousAuthenticationFilter.class);
        return http.build();
    }
}
