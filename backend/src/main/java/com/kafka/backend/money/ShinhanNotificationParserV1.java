package com.kafka.backend.money;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;
public final class ShinhanNotificationParserV1 extends BankParserSupport {
    private static final Pattern BODY=Pattern.compile("^"+WON+"원\\s+(.+?)\\s*(\\d{2}\\.\\d{2} \\d{2}:\\d{2}) 잔액 "+WON+"원$");
    public ShinhanNotificationParserV1(){super("SHINHAN","com.shinhan.sbanking");}
    public ParsedCandidate parse(MoneyRawNotification r){
        String title=clean(r.title()); var m=BODY.matcher(body(r));
        if(!supports(r)||!title.matches("입금|출금")||!m.matches())return unknown(r);
        var account=PRODUCT.matcher(m.group(2)); if(!account.find())return unknown(r);
        String hint=account.group(), cp=(m.group(2).substring(0,account.start())+m.group(2).substring(account.end())).trim();
        var dir=direction(title);
        return candidate(r,dir,m.group(1),dir==Direction.OUT?hint:null,dir==Direction.IN?hint:null,cp,m.group(4),m.group(3),"ACCOUNT_ACTIVITY");
    }
}
