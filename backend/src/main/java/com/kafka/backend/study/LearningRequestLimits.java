package com.kafka.backend.study;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component @Order(-111)
class LearningRequestLimits extends OncePerRequestFilter {
    private static final int LIMIT=32768;
    private long minute;
    private final Map<String,Integer> counts=new HashMap<>();
    @Override protected boolean shouldNotFilter(HttpServletRequest r){
        String path=r.getRequestURI();
        return !(path.startsWith("/api/study/learning-") || path.startsWith("/api/study/activity/") || path.equals("/api/study/statistics"));
    }
    private synchronized boolean admit(String remote,long window){
        if(window!=minute){counts.clear();minute=window;}
        if(counts.size()>=4096&&!counts.containsKey(remote))return false;
        int count=counts.getOrDefault(remote,0);
        if(count>=240)return false;
        counts.put(remote,count+1);return true;
    }
    private static void reject(HttpServletResponse response,int status,String code)throws IOException{
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write(StudyValidation.JSON.writeValueAsString(Map.of("code",code)));
    }
    @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse s,FilterChain chain)throws IOException,ServletException{
        s.setHeader("Cache-Control","private, no-store");
        if(!admit(r.getRemoteAddr(),System.currentTimeMillis()/60000)){
            s.setHeader("Retry-After","60");reject(s,429,"RATE_LIMIT");return;
        }
        if(!Set.of("POST","PATCH","DELETE").contains(r.getMethod())){chain.doFilter(r,s);return;}
        if(r.getContentLengthLong()>LIMIT){reject(s,413,"PAYLOAD_LIMIT");return;}
        byte[] bytes=r.getInputStream().readNBytes(LIMIT+1);
        if(bytes.length>LIMIT){reject(s,413,"PAYLOAD_LIMIT");return;}
        chain.doFilter(new HttpServletRequestWrapper(r){
            @Override public ServletInputStream getInputStream(){
                var stream=new ByteArrayInputStream(bytes);
                return new ServletInputStream(){
                    public int read(){return stream.read();}
                    public int read(byte[] b,int off,int len){return stream.read(b,off,len);}
                    public boolean isFinished(){return stream.available()==0;}
                    public boolean isReady(){return true;}
                    public void setReadListener(ReadListener l){throw new UnsupportedOperationException();}
                };
            }
            @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
        },s);
    }
}
