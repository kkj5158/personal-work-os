package com.kafka.backend.naverarchive;

import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
import org.springframework.stereotype.Component;

interface NaverRssSource { NaverRssFeed.Feed fetch(); }

@Component
final class NaverRssClient implements NaverRssSource {
 final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).version(HttpClient.Version.HTTP_1_1).followRedirects(HttpClient.Redirect.NEVER).build();
 static HttpResponse.BodySubscriber<byte[]> bounded(){
  var target=HttpResponse.BodySubscribers.ofByteArray();
  return new HttpResponse.BodySubscriber<>(){
   Flow.Subscription subscription;long bytes;boolean finished;
   public CompletionStage<byte[]> getBody(){return target.getBody();}
   public synchronized void onSubscribe(Flow.Subscription s){subscription=s;target.onSubscribe(s);CompletableFuture.delayedExecutor(20,TimeUnit.SECONDS).execute(()->{synchronized(this){if(!finished){finished=true;s.cancel();target.onError(new NaverRssFeed.Failure("BODY_TIMEOUT"));}}});}
   public synchronized void onNext(List<ByteBuffer> chunks){if(finished)return;for(var b:chunks)bytes+=b.remaining();if(bytes>NaverRssFeed.MAX_BYTES){finished=true;subscription.cancel();target.onError(new NaverRssFeed.Failure("PAYLOAD_TOO_LARGE"));}else target.onNext(chunks);}
   public synchronized void onError(Throwable e){if(!finished){finished=true;target.onError(e);}}public synchronized void onComplete(){if(!finished){finished=true;target.onComplete();}}
  };
 }
 static Instant retryAfter(String value,Instant now){try{long seconds=Long.parseLong(value);try{Instant result=now.plusSeconds(Math.max(1,seconds));return result.isAfter(Instant.parse("9999-12-31T00:00:00Z"))?Instant.parse("9999-12-31T00:00:00Z"):result;}catch(RuntimeException tooLong){return Instant.parse("9999-12-31T00:00:00Z");}}catch(RuntimeException e){try{return ZonedDateTime.parse(value,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant();}catch(RuntimeException ignored){return null;}}}
 static void checkStatus(int status,String retryAfter,Instant now){
  if(status==401||status==403)throw new NaverRssFeed.Failure("POLICY_BLOCKED",true,null);
  if(status==429)throw new NaverRssFeed.Failure("RATE_LIMITED",false,retryAfter(retryAfter,now));
  if(status>=300&&status<400)throw new NaverRssFeed.Failure("REDIRECT_DENIED",true,null);
  if(status>=500)throw new NaverRssFeed.Failure("SOURCE_UNAVAILABLE");
  if(status!=200)throw new NaverRssFeed.Failure("SOURCE_HTTP_ERROR");
 }
 public NaverRssFeed.Feed fetch(){
  try{
   var request=HttpRequest.newBuilder(URI.create(NaverRssFeed.URL)).timeout(Duration.ofSeconds(15)).header("User-Agent","ORBIT-Owner-RSS/1.0 (owner-authorized public RSS)").header("Accept","application/rss+xml, application/xml, text/xml").GET().build();
   var r=client.send(request,info->bounded());checkStatus(r.statusCode(),r.headers().firstValue("Retry-After").orElse(""),Instant.now());
   if(!r.uri().equals(URI.create(NaverRssFeed.URL)))throw new NaverRssFeed.Failure("REDIRECT_DENIED",true,null);
   String type=r.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);if(!type.contains("xml"))throw new NaverRssFeed.Failure("INVALID_CONTENT_TYPE");
   return NaverRssFeed.parse(r.body());
  }catch(NaverRssFeed.Failure e){throw e;}catch(InterruptedException e){Thread.currentThread().interrupt();throw new NaverRssFeed.Failure("NETWORK_INTERRUPTED");}catch(Exception e){for(Throwable c=e;c!=null;c=c.getCause())if(c instanceof NaverRssFeed.Failure f)throw f;throw new NaverRssFeed.Failure("NETWORK_ERROR");}
 }
}
