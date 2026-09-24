package com.kafka.backend.money;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Synthetic bodies reproducing the sanitized Drive catalog and audit timing; no captured bodies or names. */
final class VerifiedMoneyFixtures {
    static final List<MoneyNotificationParser> PARSERS=List.of(new ShinhanNotificationParserV1(),new IbkNotificationParserV1(),new WooriNotificationParserV1(),new KakaoNotificationParserV1());
    static final Instant NOW=Instant.parse("2026-09-24T09:00:00Z");
    static MoneyAccount account(String provider,String name,AccountRole role,String mask,String suffix){return new MoneyAccount(UUID.randomUUID(),provider,name,role,mask,suffix,false,0);}
    static List<MoneyAccount> accounts(){return List.of(
        account("SHINHAN","급여통장",AccountRole.INCOME_HUB,null,"1228"),account("IBK","생활비",AccountRole.SPENDING,"975-******-01-014",null),
        account("WOORI","생활비",AccountRole.SPENDING,"1002-855-037***",null),account("KAKAO","입출금통장",AccountRole.SAVINGS_GATEWAY,null,"8557"),
        account("KAKAO","최애적금",AccountRole.SAVINGS,null,"7530"),account("SHINHAN","정기적금",AccountRole.SAVINGS,null,"6017"),
        account("KAKAO","자유적금",AccountRole.SAVINGS,null,"4851"));}
    static MoneyRawNotification raw(String provider,String title,String text,Instant time){
        String pkg=switch(provider){case "SHINHAN"->"com.shinhan.sbanking";case "IBK"->"com.ibk.android.ionebank";case "WOORI"->"com.wooribank.smart.npib";default->"com.kakaobank.channel";};
        return new MoneyRawNotification(UUID.randomUUID(),pkg,UUID.randomUUID().toString(),"synthetic-batch2",title,text,text,time,time,
            Map.of(),UUID.randomUUID().toString(),ProcessingState.RECEIVED,0);
    }
    static MoneyRawNotification side(String bank,Direction dir,int amount,String time,String account,String cp){
        Instant instant=LocalDateTime.parse("2026-09-24T"+time).atZone(ZoneId.of("Asia/Seoul")).toInstant();
        String money=String.format(Locale.ROOT,"%,d",amount),d=dir==Direction.IN?"입금":"출금";
        String minute=instant.atZone(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("MM/dd HH:mm"));
        return switch(bank){
            case "SHINHAN"->raw(bank,d,money+"원 "+cp+" "+account+" "+minute.replace('/','.')+" 잔액 50,000원",instant);
            case "IBK"->raw(bank,"입출금","["+d+"] "+money+"원 "+cp+" 975-******-01-014 "+minute+" / 잔액 50,000원",instant);
            case "WOORI"->raw(bank,"입출금","["+d+"] "+cp+"　　　 "+money+"원 1002-855-037***계좌 잔액 50,000원 "+minute+":"+String.format("%02d",instant.atZone(ZoneId.of("Asia/Seoul")).getSecond()),instant);
            default->raw(bank,d+" "+money+"원",(dir==Direction.OUT?account+" → "+cp:cp+" → "+account)+" 잔액 50,000원",instant);
        };
    }
    static List<MoneyRawNotification> audit(){return List.of(
        side("IBK",Direction.OUT,10000,"16:54:36.875",null,"신한오픈<OWNER>"),side("SHINHAN",Direction.IN,10000,"16:54:39.624","급여통장(1228)","<OWNER>"),
        side("IBK",Direction.IN,1000,"16:56:47.101",null,"<OWNER>"),side("SHINHAN",Direction.OUT,1000,"16:56:48.442","급여통장(1228)","<OWNER>"),
        side("IBK",Direction.OUT,1000,"16:57:26.047",null,"신한오픈<OWNER>"),side("WOORI",Direction.IN,1000,"16:57:28.803",null,"<OWNER>"),
        side("KAKAO",Direction.IN,10000,"16:57:54.810","입출금통장(8557)","<OWNER>"),side("WOORI",Direction.OUT,10000,"16:57:56.169",null,"신한오픈<OWNER>"),
        side("KAKAO",Direction.OUT,10000,"16:58:12.465","입출금통장(8557)","신한오픈<OWNER>"),side("SHINHAN",Direction.IN,10000,"16:58:15.475","급여통장(1228)","<OWNER>"),
        side("KAKAO",Direction.IN,19000,"16:58:39.188","입출금통장(8557)","<OWNER>"),side("SHINHAN",Direction.OUT,19000,"16:58:40.882","급여통장(1228)","<OWNER>"),
        raw("KAKAO","입금 10,000원","최애적금(7530) 출금 → 입출금통장(8557) 잔액 36,000원",Instant.parse("2026-09-24T07:59:19.193Z")),
        raw("KAKAO","출금 10,000원","입출금통장(8557) → 최애적금(7530) 잔액 26,000원",Instant.parse("2026-09-24T07:59:27.530Z")),
        side("SHINHAN",Direction.IN,3000,"16:59:58.896","급여통장(1228)","<OWNER>"),side("WOORI",Direction.OUT,3000,"16:59:58.950",null,"신한오픈<OWNER>"),
        side("SHINHAN",Direction.OUT,1000,"17:00:15.186","급여통장(1228)","<OWNER>"),side("SHINHAN",Direction.IN,1000,"17:00:15.203","정기적금(6017)",""));}
    static MoneyNotificationParser parser(MoneyRawNotification r){return PARSERS.stream().filter(p->p.supports(r)).findFirst().orElseThrow();}
    static ParseAttempt attempt(MoneyRawNotification r){var p=parser(r);var c=p.parse(r);return new ParseAttempt(UUID.randomUUID(),r.id(),p.key(),p.version(),c.parseStatus().name(),null,c,r.receivedAt());}
    static Map<String,Object> payload(MoneyRawNotification r){var p=new LinkedHashMap<String,Object>();p.put("sourcePackage",r.sourcePackage());p.put("title",r.title());p.put("text",r.text());
        p.put("bigText",r.bigText());p.put("postedAt",r.postedAt().toString());p.put("notificationKey",r.notificationKey());p.put("idempotencyKey",r.dedupeKey());return p;}
}
