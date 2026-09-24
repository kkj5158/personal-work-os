package com.kafka.backend.money;

import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;

/** Only documented sanitized shapes. Synthetic package names are harness identifiers, not bank discovery. */
final class MoneyFixtures {
    record Fixture(String key, String provider, String title, String text, Direction direction,
                   BigDecimal amount, BigDecimal balance, String time, List<String> suffixes) {}
    static List<Fixture> all() throws Exception {
        try(var stream=MoneyFixtures.class.getResourceAsStream("/money/notification-fixtures.json")) {
            return List.of(JsonMapper.builder().build().readValue(stream,Fixture[].class));
        }
    }
    static Map<String,Object> payload(Fixture fixture) {
        var result=new LinkedHashMap<String,Object>();
        result.put("sourcePackage","fixture."+fixture.provider().toLowerCase(Locale.ROOT));
        result.put("notificationKey",fixture.key()); result.put("deviceId","sanitized-test-device");
        result.put("postedAt","2026-09-24T05:31:00.123456789Z");
        result.put("title",fixture.title()); result.put("text",fixture.text());
        result.put("rawPayload",Map.of("android.extra",List.of("한글",Map.of("preserved",true))));
        return result;
    }
    static MoneyRawNotification raw(Fixture fixture) {
        return new MoneyRawNotification(UUID.randomUUID(),"fixture."+fixture.provider().toLowerCase(Locale.ROOT),fixture.key(),
                "sanitized-test-device",fixture.title(),fixture.text(),null,Instant.parse("2026-09-24T05:31:00Z"),Instant.now(),
                payload(fixture),"test",ProcessingState.RECEIVED,0);
    }
    /** Deliberately test-only: proves the SPI can carry these shapes; it is not a production bank parser. */
    static MoneyNotificationParser parser(String provider) {
        return new MoneyNotificationParser() {
            public String key(){return "fixture-"+provider;}
            public String version(){return "2026-09-24-harness";}
            public boolean supports(MoneyRawNotification raw){return ("fixture."+provider.toLowerCase(Locale.ROOT)).equals(raw.sourcePackage());}
            public ParsedCandidate parse(MoneyRawNotification raw){
                String title=Objects.toString(raw.title(),""), body=Objects.toString(raw.bigText(),raw.text());
                String combined=title+"\n"+body;
                var amount=Pattern.compile("([0-9][0-9,]*)원").matcher(combined);
                if(!amount.find()) throw new IllegalArgumentException("No amount");
                var balance=Pattern.compile("잔액 ([0-9][0-9,]*)원").matcher(combined);
                var time=Pattern.compile("[0-9]{2}[./][0-9]{2} [0-9]{2}:[0-9]{2}(?::[0-9]{2})?").matcher(combined);
                var suffix=Pattern.compile("\\(([0-9]{4})\\)").matcher(combined);
                List<String> suffixes=new ArrayList<>(); while(suffix.find()) suffixes.add(suffix.group(1));
                boolean incoming=title.startsWith("입금") || title.equals("적금 입금 성공") || body.startsWith("[입금]");
                String[] sides=body.split(" → ",2);
                String source=sides.length==2?sides[0]:incoming?null:body;
                String destination=sides.length==2?sides[1].split(" 잔액 ")[0]:incoming?body:null;
                return new ParsedCandidate(raw.id(),provider,incoming?Direction.IN:Direction.OUT,
                        new BigDecimal(amount.group(1).replace(",","")),null,time.find()?time.group():null,source,destination,suffixes,
                        body,balance.find()?new BigDecimal(balance.group(1).replace(",","")):null,
                        title.equals("적금 입금 성공")?"SAVINGS_SUCCESS":"ACCOUNT_ACTIVITY",ParseStatus.REVIEW_REQUIRED);
            }
        };
    }
}
