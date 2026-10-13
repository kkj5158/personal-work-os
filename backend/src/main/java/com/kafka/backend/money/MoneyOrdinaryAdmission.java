package com.kafka.backend.money;

import java.util.*;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;

/** Financial admission only. Business wording corroborates a structured bank observation; it never supplies money/account facts. */
final class MoneyOrdinaryAdmission {
 private MoneyOrdinaryAdmission(){}
 static final Map<String,String> PACKAGES=Map.of("SHINHAN","com.shinhan.sbanking","IBK","com.ibk.android.ionebank","WOORI","com.wooribank.smart.npib","KAKAO","com.kakaobank.channel");
 private static final Pattern BUSINESS=Pattern.compile("(?:\\(주\\)|주식회사|㈜|(?:^|\\s)(?:CU|GS25|GS리테일)(?:\\s|$)|카페|커피|편의점|마트|식당|음식점|푸디스트|베이커리|약국|주유소|대중교통|카드결제)",Pattern.CASE_INSENSITIVE);
 private static final Pattern SPECIAL=Pattern.compile("이체|송금|오픈|적금|예금|상품입금|대출|상환|취소|환불|충전");
 static boolean domestic(ParsedCandidate c){return c!=null&&PACKAGES.containsKey(Objects.toString(c.provider(),""))&&c.parseStatus()==ParseStatus.PARSED&&c.evidence()!=null&&"VERIFIED_PUSH_V1".equals(c.evidence().get("shape"));}
 static String currency(ParsedCandidate c){
  if(c!=null&&c.evidence()!=null&&c.evidence().get("currency")!=null)return c.evidence().get("currency").toString();
  return domestic(c)?"KRW":null;
 }
 static boolean ordinary(ParsedCandidate c){
  if(!domestic(c)||!"KRW".equals(currency(c))||!"ACCOUNT_ACTIVITY".equals(c.notificationSubtype())||c.direction()==null||c.amount()==null||c.amount().signum()<=0)return false;
  String cp=Objects.toString(c.counterpartyText(),"");if(cp.isBlank()||SPECIAL.matcher(cp).find())return false;
  return c.direction()==Direction.OUT?BUSINESS.matcher(cp).find():cp.startsWith("급여 ");
 }
 /** Product/masked references identify a potential owned side and cannot be ignored as external accounts. */
 static boolean externalHint(String hint){return hint!=null&&hint.matches("[0-9][0-9 -]{5,}");}
}
