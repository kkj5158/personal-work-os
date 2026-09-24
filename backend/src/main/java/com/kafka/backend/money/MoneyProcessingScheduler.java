package com.kafka.backend.money;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.money.processing-enabled",havingValue="true",matchIfMissing=true)
public class MoneyProcessingScheduler {
    private final MoneyProcessingService service;
    public MoneyProcessingScheduler(MoneyProcessingService service){this.service=service;}
    @Scheduled(fixedDelayString="${app.money.processing-delay-ms:5000}",initialDelayString="${app.money.processing-delay-ms:5000}")
    public void run(){
        try{service.runDue();}catch(RuntimeException ignored){
            // Do not log SQL parameters or financial text. Rollback leaves the durable schedule eligible for retry.
            org.slf4j.LoggerFactory.getLogger(getClass()).warn("Money processing pass rolled back; scheduled work retained");
        }
    }
}
