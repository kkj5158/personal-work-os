package com.kafka.backend.money;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.event.*;

/** After-commit wakeup; no request identity escapes into background security context.
 * The durable due schedule remains authoritative across crash/restart/queue saturation. */
@Component
@ConditionalOnProperty(name="app.money.processing-enabled",havingValue="true",matchIfMissing=true)
public class MoneyEvidenceDispatcher {
 public record Arrived(UUID owner) {}
 private final Set<UUID> pending=ConcurrentHashMap.newKeySet();
 private final MoneyProcessingService processing;
 public MoneyEvidenceDispatcher(MoneyProcessingService processing){this.processing=processing;}
 @TransactionalEventListener(phase=TransactionPhase.AFTER_COMMIT)
 public void arrived(Arrived event){if(pending.size()<1000)pending.add(event.owner());}
 @Scheduled(fixedDelay=100)
 public void drain(){int count=0;for(var owner:pending){if(count++>=50)break;if(!pending.remove(owner))continue;
  try{processing.runOwner(owner);}catch(RuntimeException ignored){/* Durable fallback retries; never log notification bodies. */}
 }}
}
