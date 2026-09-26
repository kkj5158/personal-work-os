package com.kafka.backend.money;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import java.util.List;
import java.util.UUID;

/** Server-resolved identity, never constructed from client owner parameters. No credential retained. */
public final class BridgeAuthentication extends AbstractAuthenticationToken {
    private final UUID ownerId, deviceId, installId;
    public BridgeAuthentication(UUID ownerId, UUID deviceId, UUID installId) {
        super(List.of()); this.ownerId=ownerId; this.deviceId=deviceId; this.installId=installId; setAuthenticated(true);
    }
    public UUID ownerId(){return ownerId;}
    public UUID deviceId(){return deviceId;}
    public UUID installId(){return installId;}
    @Override public Object getCredentials(){return null;}
    @Override public Object getPrincipal(){return ownerId;}
}
