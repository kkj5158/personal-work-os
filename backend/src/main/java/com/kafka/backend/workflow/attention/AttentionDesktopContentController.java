package com.kafka.backend.workflow.attention;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import static com.kafka.backend.workflow.attention.AttentionContentTypes.*;

@RestController
@RequestMapping(AttentionDesktopContentController.BASE)
public class AttentionDesktopContentController {
    static final String BASE = "/api/workflow/attention/desktop-content";
    private final AttentionContent content;

    public AttentionDesktopContentController(AttentionContent content) {
        this.content = content;
    }

    @GetMapping("/consents")
    public ResponseEntity<List<DesktopScope>> scopes() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(content.desktopScopes());
    }

    @PostMapping(value="/consents",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> authorize(@RequestBody DesktopConsent input) {
        content.authorizeDesktop(input);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @DeleteMapping("/consents/{scope}")
    public ResponseEntity<Void> revoke(@PathVariable UUID scope) {
        content.revokeDesktop(scope);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @GetMapping("/scopes/{scope}")
    public ResponseEntity<Void> scope(@PathVariable UUID scope,HttpServletRequest request) {
        requireSecure(request);
        content.requireDesktopConsent(scope);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping(value="/reports",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<DesktopReceipt> report(HttpServletRequest request) throws IOException {
        requireSecure(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(content.submitDesktop(AttentionContentController.readBounded(request)));
    }

    private static void requireSecure(HttpServletRequest request) {
        if (!request.isSecure() || request.getQueryString()!=null) throw new AttentionException(403,"INVALID_DESKTOP_ROUTE");
    }

    @ExceptionHandler(AttentionException.class)
    public ResponseEntity<Map<String,String>> rejected(AttentionException failure) {
        return ResponseEntity.status(failure.status()).cacheControl(CacheControl.noStore())
                .body(Map.of("code",failure.code()));
    }
}
