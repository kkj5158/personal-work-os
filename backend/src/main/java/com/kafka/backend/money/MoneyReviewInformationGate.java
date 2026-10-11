package com.kafka.backend.money;

import java.util.regex.Pattern;

/** Bulk information dismissal is stricter than the existing individual noise heuristic. */
final class MoneyReviewInformationGate {
 private MoneyReviewInformationGate(){}
 private static final Pattern FINANCIAL=Pattern.compile("입금|출금|입출금|이체|결제|승인|취소|환불|송금|잔액|납부|인출|충전|계좌|통장|카드|[₩$€£¥]|\\b(?:KRW|USD|JPY|EUR|GBP|CNY|debit|credit|deposit|withdrawal|transfer|payment|paid|refund|balance|account|card)\\b|[0-9][0-9,.]*\\s*(?:원|달러|엔|유로|위안)",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
 static boolean unambiguous(MoneyTypes.MoneyRawNotification raw){
  String text=BankParserSupport.clean(raw.title())+" "+BankParserSupport.clean(raw.text())+" "+BankParserSupport.clean(raw.bigText());
  return MoneyNoiseFilter.nonFinancial(raw)&&!FINANCIAL.matcher(text).find();
 }
}
