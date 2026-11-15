package com.kafka.backend.money;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;
public final class KakaoNotificationParserV1 extends BankParserSupport {
    private static final Pattern TITLE=Pattern.compile("^(입금|출금) "+WON+"원$");
    // A credit-line balance may be negative; the movement amount in TITLE stays unsigned.
    private static final String BALANCE="(-?(?:[0-9]{1,3}(?:,[0-9]{3})*|[0-9]+))";
    private static final Pattern ROUTE=Pattern.compile("^(.+?) → (.+?)(?: 잔액 "+BALANCE+"원)?$");
    private static final Pattern AUX=Pattern.compile("^([가-힣]+\\([0-9]{1,4}\\))에 "+WON+"원이 입금되었어요[.!]?$" );
    public KakaoNotificationParserV1(){super("KAKAO","com.kakaobank.channel");}
    @Override public String version(){return "1.0.1";}
    public ParsedCandidate parse(MoneyRawNotification r){
        if(!supports(r))return unknown(r);
        if("적금 입금 성공".equals(clean(r.title()))){var a=AUX.matcher(body(r));
            return a.matches()?candidate(r,Direction.IN,a.group(2),null,a.group(1),null,null,null,"SAVINGS_SUCCESS"):unknown(r);}
        var t=TITLE.matcher(clean(r.title()));var m=ROUTE.matcher(body(r));if(!t.matches()||!m.matches())return unknown(r);
        // Do not silently turn a malformed balance suffix into a counterparty/product name.
        if(m.group(3)==null&&body(r).contains(" 잔액 "))return unknown(r);
        var dir=direction(t.group(1));String left=m.group(1).replaceFirst(" 출금$",""),right=m.group(2);
        String from=PRODUCT.matcher(left).matches()?left:null,to=PRODUCT.matcher(right).matches()?right:null;
        if((dir==Direction.OUT&&from==null)||(dir==Direction.IN&&to==null))return unknown(r);
        String cp=from!=null&&to!=null?null:dir==Direction.IN?left:right;
        return candidate(r,dir,t.group(2),from,to,cp,m.group(3),null,from!=null&&to!=null?"INTERNAL_ROUTE":"ACCOUNT_ACTIVITY");
    }
}
