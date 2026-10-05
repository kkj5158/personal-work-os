package com.kafka.backend.workflow.attention;

import java.util.List;
import java.util.UUID;
import org.springframework.security.authentication.AbstractAuthenticationToken;

/** Queue-only credential. The security chain denies every other POS API. */
public final class AttentionAuthentication extends AbstractAuthenticationToken {
    private final UUID ownerId, credentialId;
    private final String namespace, kind;
    public AttentionAuthentication(UUID ownerId, UUID credentialId, String namespace, String kind) {
        super(List.of()); this.ownerId=ownerId; this.credentialId=credentialId; this.namespace=namespace; this.kind=kind; setAuthenticated(true);
    }
    public UUID ownerId(){return ownerId;}
    public UUID credentialId(){return credentialId;}
    public String namespace(){return namespace;}
    public boolean producer(){return "PRODUCER".equals(kind);}
    @Override public Object getPrincipal(){return ownerId;}
    @Override public Object getCredentials(){return "";}
}
