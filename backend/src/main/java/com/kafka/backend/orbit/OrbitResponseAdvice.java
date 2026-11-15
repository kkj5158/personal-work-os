package com.kafka.backend.orbit;

import org.springframework.core.MethodParameter;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import tools.jackson.databind.ObjectMapper;

import java.util.*;

/** Privacy boundary for ORBIT only. Canonical POS responses are unchanged. */
@RestControllerAdvice(basePackages = "com.kafka.backend.orbit")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class OrbitResponseAdvice implements ResponseBodyAdvice<Object> {
    private final ObjectMapper json;
    public OrbitResponseAdvice(ObjectMapper json) { this.json = json; }
    private static final Set<String> OMIT = Set.of("userid", "ownerid", "maskedreference", "suffix",
            "imagedata", "imageurl", "rawpayload", "rawbody", "notificationbody", "text", "bigtext",
            "memo", "memos", "notes", "memoitems", "metadata", "password", "token", "accesstoken",
            "refreshtoken", "secret", "credentials", "accountreference", "counterparty", "counterpartytext");

    @Override public boolean supports(MethodParameter method, Class<? extends HttpMessageConverter<?>> converter) { return true; }
    @Override public Object beforeBodyWrite(Object body, MethodParameter method, MediaType type,
            Class<? extends HttpMessageConverter<?>> converter, ServerHttpRequest request, ServerHttpResponse response) {
        Object safe = scrub(json.convertValue(body, Object.class), 0);
        if (json.writeValueAsBytes(safe).length > 262144) throw new LimitExceeded();
        return safe;
    }
    static Object scrub(Object value, int depth) {
        if (depth > 24) throw new LimitExceeded();
        if (value instanceof Map<?, ?> map) {
            Map<String,Object> safe = new LinkedHashMap<>();
            for (var entry : map.entrySet()) {
                String key = entry.getKey().toString();
                if (!OMIT.contains(key.replace("_", "").toLowerCase(Locale.ROOT)))
                    safe.put(key, scrub(entry.getValue(), depth + 1));
            }
            return safe;
        }
        if (value instanceof Collection<?> list) {
            if (list.size() > 1000) throw new LimitExceeded();
            return list.stream().map(item -> scrub(item, depth + 1)).toList();
        }
        if (value instanceof String text) {
            if (text.startsWith("data:") || text.contains("-----BEGIN ") || text.matches("(?s).*eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+.*")) return "[REDACTED]";
            return text.length() > 300 ? text.substring(0, 300) + "…" : text;
        }
        return value;
    }
    public static class LimitExceeded extends RuntimeException {}
    @ExceptionHandler(LimitExceeded.class)
    ResponseEntity<Map<String,String>> tooLarge() {
        return ResponseEntity.unprocessableEntity().body(Map.of("code", "CONTEXT_LIMIT", "message", "Context exceeds the safe limit; request a smaller period or page."));
    }
    @ExceptionHandler({org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class})
    ResponseEntity<Map<String,String>> invalid() { return ResponseEntity.badRequest().body(Map.of("message", "Invalid request parameter")); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String,String>> failure(Exception ex) {
        if (ex instanceof com.kafka.backend.common.InvalidRequestException)
            return ResponseEntity.badRequest().body(Map.of("message", "Invalid context request"));
        if (ex instanceof org.springframework.web.HttpRequestMethodNotSupportedException)
            return ResponseEntity.status(405).body(Map.of("message", "Read-only endpoint"));
        // Do not log exception messages, SQL, bound arguments or personal context.
        return ResponseEntity.status(503).body(Map.of("message", "Context temporarily unavailable"));
    }
}
