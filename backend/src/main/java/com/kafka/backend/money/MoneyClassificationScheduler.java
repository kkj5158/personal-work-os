package com.kafka.backend.money;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
@Component
@ConditionalOnProperty(name="app.money.classification-enabled",havingValue="true",matchIfMissing=true)
public class MoneyClassificationScheduler {
 private final MoneyClassificationAutomaticService service;
 public MoneyClassificationScheduler(MoneyClassificationAutomaticService service){this.service=service;}
 @Scheduled(fixedDelayString="${app.money.classification-delay-ms:5000}",initialDelayString="${app.money.classification-delay-ms:5000}") public void run(){service.runDue();}
}
