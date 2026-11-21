package com.kafka.backend.naverarchive;

import java.time.ZoneOffset;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;

@Component
final class NaverRssScheduler {
 final NaverRssSyncService service;
 // Private scheduler, deliberately not a TaskScheduler bean: RSS I/O must not
 // replace or block the existing MONEY / LOG / STUDY scheduling threads.
 private ThreadPoolTaskScheduler scheduler;
 NaverRssScheduler(NaverRssSyncService service){this.service=service;}
 @jakarta.annotation.PostConstruct void start(){if(!service.available)return;scheduler=new ThreadPoolTaskScheduler();scheduler.setPoolSize(1);scheduler.setThreadNamePrefix("naver-rss-");scheduler.setDaemon(true);scheduler.setWaitForTasksToCompleteOnShutdown(true);scheduler.setAwaitTerminationSeconds(20);scheduler.setErrorHandler(e->org.slf4j.LoggerFactory.getLogger(getClass()).warn("NAVER_RSS_SCHEDULER_FAILED"));scheduler.initialize();scheduler.schedule(service::scheduled,new CronTrigger("0 */10 * * * *",ZoneOffset.UTC));}
 @jakarta.annotation.PreDestroy void close(){if(scheduler!=null)scheduler.shutdown();}
}
