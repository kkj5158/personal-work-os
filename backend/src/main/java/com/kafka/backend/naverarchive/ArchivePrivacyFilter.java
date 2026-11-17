package com.kafka.backend.naverarchive;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
/** Private response metadata and bounded JSON input; never log source content. */
@Component
public class ArchivePrivacyFilter extends OncePerRequestFilter {
 @Override protected boolean shouldNotFilter(HttpServletRequest r){return !r.getRequestURI().startsWith("/api/naver-archive");}
 @Override protected void doFilterInternal(HttpServletRequest r,HttpServletResponse p,FilterChain c)throws ServletException,IOException{
  p.setHeader("Cache-Control","private, no-store");p.setHeader("X-Robots-Tag","noindex, nofollow, noarchive");p.setHeader("X-Content-Type-Options","nosniff");
  long max=r.getRequestURI().equals("/api/naver-archive/imports/preview")?11_100_000:1_100_000;
  if(r.getContentLengthLong()>max){p.setStatus(413);return;}
  var bounded=new HttpServletRequestWrapper(r){@Override public ServletInputStream getInputStream()throws IOException{var source=r.getInputStream();return new ServletInputStream(){long count;public int read()throws IOException{int value=source.read();if(value!=-1&&++count>max)throw new IOException("Archive request exceeds limit");return value;}public boolean isReady(){return source.isReady();}public boolean isFinished(){return source.isFinished();}public void setReadListener(ReadListener l){source.setReadListener(l);}};}};
  c.doFilter(bounded,p);
 }
}
