package com.kafka.backend.money;

import java.util.regex.Pattern;

/**
 * Deterministic "is this even a financial transaction?" gate for notifications that no bank
 * grammar recognised. Package identity alone never proves a transaction, so an allowlisted bank
 * app can still send ads, OTPs or security notices. Only clearly non-transactional text is
 * classified as noise; anything carrying an amount together with transaction wording remains a
 * financial candidate for Review. The raw notification is never modified or deleted.
 */
final class MoneyNoiseFilter {
    private MoneyNoiseFilter() {}
    // Korean advertising law requires "(광고)" at the start of promotional messages.
    private static final Pattern AD=Pattern.compile("^\\s*[\\(\\[]\\s*광고\\s*[\\)\\]]");
    private static final Pattern AMOUNT=Pattern.compile("[0-9][0-9,]*\\s*원");
    private static final Pattern TRANSACTION=Pattern.compile("입금|출금|이체|결제|승인|취소|환불|송금|잔액|납부|인출|충전");
    private static final Pattern PROMOTION=Pattern.compile("이벤트|혜택|캐시백|쿠폰|프로모션|추첨|당첨|초대|광고|포인트|금리 우대|특판");

    enum Verdict { NON_FINANCIAL, FINANCIAL_CANDIDATE }

    static Verdict classify(String title,String text,String bigText) {
        String t=BankParserSupport.clean(title), body=BankParserSupport.clean(bigText==null||bigText.isBlank()?text:bigText);
        String all=(t+" "+body).trim();
        if(AD.matcher(t).find()||AD.matcher(body).find())return Verdict.NON_FINANCIAL;
        if(!AMOUNT.matcher(all).find())return Verdict.NON_FINANCIAL;
        if(PROMOTION.matcher(all).find()&&!TRANSACTION.matcher(all).find())return Verdict.NON_FINANCIAL;
        return Verdict.FINANCIAL_CANDIDATE;
    }
    static boolean nonFinancial(MoneyTypes.MoneyRawNotification raw){
        return classify(raw.title(),raw.text(),raw.bigText())==Verdict.NON_FINANCIAL;
    }
}
