package com.kafka.backend.log;

import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class LogHeaders extends OncePerRequestFilter {
  @Override
  protected boolean shouldNotFilter(HttpServletRequest r) {
    return !r.getRequestURI().startsWith("/api/log/");
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest r, HttpServletResponse response, jakarta.servlet.FilterChain chain)
      throws jakarta.servlet.ServletException, IOException {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    long max = r.getRequestURI().endsWith("/bytes") ? 18L * 1024 * 1024 : 16L * 1024 * 1024;
    if (r.getContentLengthLong() > max) {
      response.setStatus(413);
      response.setContentType("application/json");
      response.getWriter().write("{\"message\":\"LOG request is too large\"}");
      return;
    }
    chain.doFilter(
        new HttpServletRequestWrapper(r) {
          @Override
          public jakarta.servlet.ServletInputStream getInputStream() throws IOException {
            var source = super.getInputStream();
            return new jakarta.servlet.ServletInputStream() {
              long read;

              void count(int value) throws IOException {
                if (value > 0) {
                  read += value;
                  if (read > max) throw new IOException("LOG request too large");
                }
              }

              @Override
              public int read() throws IOException {
                int value = source.read();
                count(value < 0 ? 0 : 1);
                return value;
              }

              @Override
              public int read(byte[] bytes, int offset, int length) throws IOException {
                int value = source.read(bytes, offset, (int) Math.min(length, max - read + 1));
                count(value);
                return value;
              }

              @Override
              public boolean isFinished() {
                return source.isFinished();
              }

              @Override
              public boolean isReady() {
                return source.isReady();
              }

              @Override
              public void setReadListener(jakarta.servlet.ReadListener listener) {
                source.setReadListener(listener);
              }
            };
          }
        },
        response);
  }
}
