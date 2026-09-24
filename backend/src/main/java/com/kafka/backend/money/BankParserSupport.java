package com.kafka.backend.money;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.regex.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Shared syntax/time mechanics only; bank grammars live in separately versioned parsers. */
abstract class BankParserSupport implements MoneyNotificationParser {
    static final String WON="([0-9]{1,3}(?:,[0-9]{3})*|[0-9]+)";
    static final Pattern PRODUCT=Pattern.compile("([가-힣A-Za-z]+)\\s*\\(([0-9]{1,4})\\)");
    private static final Pattern TIME=Pattern.compile("(\\d{2})[./](\\d{2}) (\\d{2}):(\\d{2})(?::(\\d{2}))?");
    final String provider, packageName;
    BankParserSupport(String provider,String packageName){this.provider=provider;this.packageName=packageName;}
    public String key(){return provider.toLowerCase(Locale.ROOT)+"-push";}
    public String version(){return "1.0.0";}
    public boolean supports(MoneyRawNotification raw){return packageName.equals(raw.sourcePackage());}
    static String clean(String text){return text==null?"":text.replaceAll("(?U)\\s+"," ").trim();}
    static String body(MoneyRawNotification raw){return clean(raw.bigText()==null||raw.bigText().isBlank()?raw.text():raw.bigText());}
    static BigDecimal won(String value){return new BigDecimal(value.replace(",",""));}
    static Direction direction(String value){return "입금".equals(value)?Direction.IN:Direction.OUT;}
    ParsedCandidate unknown(MoneyRawNotification r){return new ParsedCandidate(r.id(),provider,null,null,null,null,
            null,null,List.of(),null,null,"UNRECOGNIZED",ParseStatus.REVIEW_REQUIRED,r.postedAt(),null,null,version(),Map.of("reason","UNRECOGNIZED_SHAPE"));}
    ParsedCandidate candidate(MoneyRawNotification r, Direction dir, String amount, String from, String to,
            String counterparty,String balance,String time,String subtype){
        if(counterparty!=null&&counterparty.length()>500)return unknown(r);
        Instant providerAt=null; TimeSource source=TimeSource.ANDROID_POSTED_AT;
        if(time!=null){
            var m=TIME.matcher(time); if(!m.matches())return unknown(r);
            var posted=r.postedAt().atZone(ZoneId.of("Asia/Seoul"));
            List<Instant> possibilities=new ArrayList<>();
            for(int year=posted.getYear()-1;year<=posted.getYear()+1;year++)try{
                possibilities.add(LocalDateTime.of(year,Integer.parseInt(m.group(1)),Integer.parseInt(m.group(2)),
                    Integer.parseInt(m.group(3)),Integer.parseInt(m.group(4)),m.group(5)==null?0:Integer.parseInt(m.group(5)))
                    .atZone(ZoneId.of("Asia/Seoul")).toInstant());
            }catch(DateTimeException ignored){}
            providerAt=possibilities.stream().min(Comparator.comparing(i->Duration.between(i,r.postedAt()).abs())).orElse(null);
            if(providerAt==null||Duration.between(providerAt,r.postedAt()).abs().compareTo(Duration.ofHours(24))>0)return unknown(r);
            source=m.group(5)==null?TimeSource.PROVIDER_MINUTE:TimeSource.PROVIDER_SECOND;
        }
        var suffixes=new ArrayList<String>();
        for(String hint:List.of(from==null?"":from,to==null?"":to)){
            var m=PRODUCT.matcher(hint);while(m.find())suffixes.add(m.group(2));
        }
        if(won(amount).signum()<=0)return unknown(r);
        return new ParsedCandidate(r.id(),provider,dir,won(amount),providerAt==null?r.postedAt():providerAt,time,
                from,to,List.copyOf(suffixes),counterparty==null||counterparty.isBlank()?null:counterparty,
                balance==null?null:won(balance),subtype,ParseStatus.PARSED,r.postedAt(),providerAt,source,version(),
                Map.of("shape","VERIFIED_PUSH_V1","timePrecision",source==TimeSource.PROVIDER_MINUTE?"MINUTE":source==TimeSource.PROVIDER_SECOND?"SECOND":"ANDROID_MILLISECOND",
                        "yearResolution",time==null?"NOT_APPLICABLE":"NEAREST_KOREA_YEAR_WITHIN_24H","confidence","STRUCTURAL"));
    }
}
