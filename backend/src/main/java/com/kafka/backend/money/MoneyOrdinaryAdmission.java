package com.kafka.backend.money;

import java.util.*;
import java.util.regex.Pattern;
import static com.kafka.backend.money.MoneyTypes.*;

/** Financial admission only. Structured bank evidence supplies financial identity, never merchant wording. */
final class MoneyOrdinaryAdmission {
 private MoneyOrdinaryAdmission(){}
 static final Map<String,String> PACKAGES=Map.of("SHINHAN","com.shinhan.sbanking","IBK","com.ibk.android.ionebank","WOORI","com.wooribank.smart.npib","KAKAO","com.kakaobank.channel");
 private static final Pattern BUSINESS=Pattern.compile("(?:\\(주\\)|주식회사|㈜|(?:^|\\s)(?:CU|GS25|지에스25|씨유|GS리테일)|탐앤탐스|빽다방|카페|커피|편의점|마트|식당|음식점|푸디스트|베이커리|약국|주유소|대중교통|카드결제)",Pattern.CASE_INSENSITIVE);
 private static final Pattern SPECIAL=Pattern.compile("적금|예금|상품입금|대출|상환|취소|환불|충전|반환|정정");
 private static final Pattern DEDICATED=Pattern.compile("대출|상환|취소|환불|충전|반환|정정");
 private static final Pattern TRANSFER_INTENT=Pattern.compile("이체|송금|오픈");
 static boolean domestic(ParsedCandidate c){return c!=null&&PACKAGES.containsKey(Objects.toString(c.provider(),""))&&c.parseStatus()==ParseStatus.PARSED&&c.evidence()!=null&&"VERIFIED_PUSH_V1".equals(c.evidence().get("shape"));}
 static String currency(ParsedCandidate c){
  if(c!=null&&c.evidence()!=null&&c.evidence().get("currency")!=null)return c.evidence().get("currency").toString();
  return domestic(c)?"KRW":null;
 }
 static boolean ordinary(ParsedCandidate c){
  if(!domestic(c)||!"KRW".equals(currency(c))||!"ACCOUNT_ACTIVITY".equals(c.notificationSubtype())||c.direction()==null||c.amount()==null||c.amount().signum()<=0||c.occurredAt()==null||c.postedAt()==null||c.timeSource()==null)return false;
  String cp=Objects.toString(c.counterpartyText(),"");
  return !cp.isBlank()&&!special(c)&&!transferIntent(c);
 }
 static boolean special(ParsedCandidate c){return c!=null&&SPECIAL.matcher(Objects.toString(c.counterpartyText(),"")).find();}
 static boolean dedicated(ParsedCandidate c){return c!=null&&DEDICATED.matcher(Objects.toString(c.counterpartyText(),"")).find();}
 static boolean transferIntent(ParsedCandidate c){return c!=null&&TRANSFER_INTENT.matcher(Objects.toString(c.counterpartyText(),"")).find();}
 /** Explicit external semantics veto automatic pairing; unfamiliar wording remains admissible. */
 static boolean explicitExternal(ParsedCandidate c){
  return explicitExternal(c.direction(),c.counterpartyText());
 }
 static boolean explicitExternal(Direction direction,String counterpart){
  String cp=Objects.toString(counterpart,"");
  return direction==Direction.OUT?BUSINESS.matcher(cp).find():cp.matches(".*(?:급여|급료|정산|월급|프리랜서|용역대금).*");
 }
 /** Product/masked references identify a potential owned side and cannot be ignored as external accounts. */
 static boolean externalHint(String hint){return hint!=null&&hint.matches("[0-9][0-9 -]{5,}");}
 static boolean numericOtherSide(ParsedCandidate c){return c!=null&&c.direction()!=null&&externalHint(c.direction()==Direction.OUT?c.destinationAccountHint():c.sourceAccountHint());}
}
