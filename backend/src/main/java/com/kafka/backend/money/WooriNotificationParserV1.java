package com.kafka.backend.money;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;
public final class WooriNotificationParserV1 extends BankParserSupport {
    private static final Pattern BODY=Pattern.compile("^\\[(입금|출금)\\] (.+?) "+WON+"원 ([0-9*]+-[0-9*]+-[0-9*]+)계좌 잔액 "+WON+"원 (\\d{2}/\\d{2} \\d{2}:\\d{2}:\\d{2})$");
    public WooriNotificationParserV1(){super("WOORI","com.wooribank.smart.npib");}
    public ParsedCandidate parse(MoneyRawNotification r){
        var m=BODY.matcher(body(r));if(!supports(r)||!m.matches()||!m.group(4).contains("*"))return unknown(r);
        var dir=direction(m.group(1));return candidate(r,dir,m.group(3),dir==Direction.OUT?m.group(4):null,
                dir==Direction.IN?m.group(4):null,m.group(2),m.group(5),m.group(6),"ACCOUNT_ACTIVITY");
    }
}
