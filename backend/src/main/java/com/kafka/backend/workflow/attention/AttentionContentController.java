package com.kafka.backend.workflow.attention;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.workflow.attention.AttentionContentTypes.*;

@RestController
@RequestMapping("/api/workflow/attention/managed")
public class AttentionContentController {
    static final String BASE = "/api/workflow/attention/managed";
    static final int MAX_BODY = 65_536;
    private final AttentionContent service;

    public AttentionContentController(AttentionContent service) {
        this.service = service;
    }

    @PostMapping(value = "/reservations", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Grant reserve(HttpServletRequest request) throws IOException {
        return service.reserve(readBounded(request));
    }

    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    @DeleteMapping("/reservations/{itemId}")
    public void revoke(@PathVariable UUID itemId) {
        service.revoke(itemId);
    }

    @PostMapping(value = "/reports/{itemId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Receipt report(@PathVariable UUID itemId,
                          @RequestHeader("X-Work-Queue-Signature") String signature,
                          HttpServletRequest request) throws IOException {
        requireSignedRoute(request,reportPath(itemId));
        return service.submit(itemId, signature, readBounded(request));
    }

    @PostMapping(value = "/start/{itemId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Grant start(@PathVariable UUID itemId, @RequestHeader("X-Work-Queue-Signature") String signature,
                       HttpServletRequest request) throws IOException {
        requireSignedRoute(request,startPath(itemId));
        return service.checkGrant(itemId,signature,readBounded(request));
    }

    @PostMapping(value = "/evidence/{itemId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public VerificationReceipt verification(@PathVariable UUID itemId,
            @RequestHeader("X-Work-Queue-Signature") String signature,HttpServletRequest request) throws IOException {
        requireSignedRoute(request,verifyPath(itemId));
        return service.verifyEvidence(itemId,signature,readBounded(request));
    }

    private void requireSignedRoute(HttpServletRequest request,String path) {
        if (!request.getRequestURI().equals(request.getContextPath()+path)
                || request.getHeader("Authorization") != null || request.getQueryString() != null || !request.isSecure()
                && !(service.isDev() && request.getRemoteAddr().equals("127.0.0.1")
                && request.getLocalAddr().equals("127.0.0.1"))) {
            throw new AttentionException(403, "INVALID_REPORT_ROUTE");
        }
    }

    static String reportPath(UUID itemId) {return BASE+"/reports/"+itemId;}
    static String verifyPath(UUID itemId) {return BASE+"/evidence/"+itemId;}
    static String startPath(UUID itemId) {return BASE+"/start/"+itemId;}

    static byte[] readBounded(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > MAX_BODY) throw new AttentionException(413, "REPORT_TOO_LARGE");
        byte[] bytes = request.getInputStream().readNBytes(MAX_BODY + 1);
        if (bytes.length > MAX_BODY) throw new AttentionException(413, "REPORT_TOO_LARGE");
        return bytes;
    }

    @ExceptionHandler(AttentionException.class)
    public org.springframework.http.ResponseEntity<java.util.Map<String,String>> rejected(AttentionException error) {
        return org.springframework.http.ResponseEntity.status(error.status())
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .body(java.util.Map.of("code", error.code()));
    }
}

