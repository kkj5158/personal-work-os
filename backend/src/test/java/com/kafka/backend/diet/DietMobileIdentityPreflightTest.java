package com.kafka.backend.diet;
import com.kafka.backend.common.CurrentUserProvider;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class DietMobileIdentityPreflightTest {
    @Test void verifiedIdentityIsResolvedBeforeTheHandler() {
        var users=mock(CurrentUserProvider.class);
        var preflight=new DietMobileIdentityPreflight(users);
        assertTrue(preflight.preHandle(null,null,null)); verify(users).getCurrentUserId();
    }
    @Test void identityFailureDoesNotReachTheDomainHandler() {
        var users=mock(CurrentUserProvider.class);when(users.getCurrentUserId()).thenThrow(new IllegalStateException("missing verified identity"));
        assertThrows(IllegalStateException.class,()->new DietMobileIdentityPreflight(users).preHandle(null,null,null));
    }
}
