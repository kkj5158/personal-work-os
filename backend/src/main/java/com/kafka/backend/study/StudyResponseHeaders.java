package com.kafka.backend.study;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class StudyResponseHeaders extends OncePerRequestFilter {
  @Override
  protected boolean shouldNotFilter(HttpServletRequest r) {
    return !r.getRequestURI().startsWith("/api/study");
  }

  @Override
  protected void doFilterInternal(HttpServletRequest r, HttpServletResponse s, FilterChain c)
      throws IOException, ServletException {
    s.setHeader("Cache-Control", "private, no-store");
    s.setHeader("X-Content-Type-Options", "nosniff");
    final long max = 2L * 1024 * 1024;
    if (r.getContentLengthLong() > max) {
      s.setStatus(413);
      return;
    }
    c.doFilter(
        new HttpServletRequestWrapper(r) {
          @Override
          public ServletInputStream getInputStream() throws IOException {
            ServletInputStream original = super.getInputStream();
            return new ServletInputStream() {
              long count;

              void consumed(int n) throws IOException {
                count += Math.max(n, 0);
                if (count > max) throw new IOException("STUDY_BODY_LIMIT");
              }

              @Override
              public int read() throws IOException {
                int value = original.read();
                if (value >= 0) consumed(1);
                return value;
              }

              @Override
              public int read(byte[] b, int off, int len) throws IOException {
                int n = original.read(b, off, (int) Math.min(len, max - count + 1));
                consumed(n);
                return n;
              }

              @Override
              public boolean isFinished() {
                return original.isFinished();
              }

              @Override
              public boolean isReady() {
                return original.isReady();
              }

              @Override
              public void setReadListener(ReadListener listener) {
                original.setReadListener(listener);
              }
            };
          }
        },
        s);
  }
}
