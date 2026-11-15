package com.kafka.backend.log;

import static org.assertj.core.api.Assertions.*;

import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;

class LogRequestLimitTest {
  @Test
  void knownLargeBodiesFailBeforeController() {
    var r = new MockHttpServletRequest("POST", "/api/log/profiles");
    r.setContent(new byte[16 * 1024 * 1024 + 1]);
    var response = new MockHttpServletResponse();
    try {
      new LogHeaders()
          .doFilter(
              r,
              response,
              (request, reply) -> {
                throw new AssertionError("Oversized request reached controller");
              });
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
    assertThat(response.getStatus()).isEqualTo(413);
  }

  @Test
  void chunkedBodyIsBoundedEvenWithoutContentLength() {
    var r =
        new MockHttpServletRequest("POST", "/api/log/profiles") {
          @Override
          public long getContentLengthLong() {
            return -1;
          }
        };
    r.setContent(new byte[16 * 1024 * 1024 + 1]);
    assertThatThrownBy(() ->
            new LogHeaders()
                .doFilter(
                    r,
                    new MockHttpServletResponse(),
                    (request, response) -> request.getInputStream().readAllBytes()))
        .isInstanceOf(IOException.class);
  }

  @Test
  void unrelatedPosRequestsAreUnchanged() throws Exception {
    var r = new MockHttpServletRequest("POST", "/api/workflow/commands");
    var response = new MockHttpServletResponse();
    new LogHeaders().doFilter(r, response, (request, reply) -> assertThat(request).isSameAs(r));
    assertThat(response.getHeader("Cache-Control")).isNull();
  }
}
