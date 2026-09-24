package com.kafka.backend.money;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;
public final class IbkNotificationParserV1 extends BankParserSupport {
    private static final Pattern BODY=Pattern.compile("^\\[(입금|출금)\\] "+WON+"원 (.+?) ([0-9*]+-[0-9*]+-[0-9*]+-[0-9*]+) (\\d{2}/\\d{2} \\d{2}:\\d{2}) / 잔액 "+WON+"원$");
    public IbkNotificationParserV1(){super("IBK","com.ibk.android.ionebank");}
    public ParsedCandidate parse(MoneyRawNotification r){
        var m=BODY.matcher(body(r)); if(!supports(r)||!m.matches()||!m.group(4).contains("*"))return unknown(r);
        var dir=direction(m.group(1));return candidate(r,dir,m.group(2),dir==Direction.OUT?m.group(4):null,
                dir==Direction.IN?m.group(4):null,m.group(3),m.group(6),m.group(5),"ACCOUNT_ACTIVITY");
    }
}
