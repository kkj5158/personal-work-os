package com.kafka.backend.morning;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Server-only release control. Empty/default configuration never issues credentials. */
@Component
@ConfigurationProperties(prefix = "kafka.morning.voice")
public class MorningVoiceProperties {
    private boolean enabled;
    private String activeRelease = "";
    private Set<UUID> allowedOwners = Set.of();
    private Map<String, Release> releases = Map.of();
    private Budget budget = new Budget();
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean v) { enabled = v; }
    public String getActiveRelease() { return activeRelease; }
    public void setActiveRelease(String v) { activeRelease = v; }
    public Set<UUID> getAllowedOwners() { return allowedOwners; }
    public void setAllowedOwners(Set<UUID> v) { allowedOwners = v; }
    public Map<String, Release> getReleases() { return releases; }
    public void setReleases(Map<String, Release> v) { releases = v; }
    public Budget getBudget() { return budget; }
    public void setBudget(Budget v) { budget = v; }

    public record Release(String provider, String agentId, String versionId, String branchId,
                          String credentialEnvironmentVariable, String environment,
                          int maxDurationSeconds, int credentialMaxAgeSeconds,
                          boolean providerHardLimitVerified, String pricingVersion,
                          MorningVoiceContract.Capabilities capabilities) {}

    public static class Budget {
        private boolean configured;
        private int dailySessionLimit;
        private int concurrentSessionLimit;
        private BigDecimal dailyCostLimit = BigDecimal.ZERO;
        private BigDecimal maximumSessionCost = BigDecimal.ZERO;
        private String currency = "";
        public boolean isConfigured() { return configured; }
        public void setConfigured(boolean v) { configured = v; }
        public int getDailySessionLimit() { return dailySessionLimit; }
        public void setDailySessionLimit(int v) { dailySessionLimit = v; }
        public int getConcurrentSessionLimit() { return concurrentSessionLimit; }
        public void setConcurrentSessionLimit(int v) { concurrentSessionLimit = v; }
        public BigDecimal getDailyCostLimit() { return dailyCostLimit; }
        public void setDailyCostLimit(BigDecimal v) { dailyCostLimit = v; }
        public BigDecimal getMaximumSessionCost() { return maximumSessionCost; }
        public void setMaximumSessionCost(BigDecimal v) { maximumSessionCost = v; }
        public String getCurrency() { return currency; }
        public void setCurrency(String v) { currency = v; }
    }
}
