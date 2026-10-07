package com.kafka.backend.money;

import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;

/** Investigative relevance only: it never assigns an account or changes a parse. */
final class MoneyReconciliationEvidenceScope {
 enum Scope { RELEVANT, UNRESOLVED, UNRELATED }
 private static final Map<String,String> PROVIDERS=Map.of("com.kakaobank.channel","KAKAO","com.ibk.android.ionebank","IBK","com.wooribank.smart.npib","WOORI","com.shinhan.sbanking","SHINHAN");
 static Scope resolve(MoneyAccount selected,List<MoneyAccount> accounts,ParsedCandidate candidate,String sourcePackage,String rawText){
  String provider=candidate==null?PROVIDERS.get(sourcePackage):candidate.provider();
  if(provider!=null&&!Objects.equals(provider,selected.provider()))return Scope.UNRELATED;
  var hints=new ArrayList<String>();
  if(candidate!=null){if(candidate.sourceAccountHint()!=null)hints.add(candidate.sourceAccountHint());if(candidate.destinationAccountHint()!=null)hints.add(candidate.destinationAccountHint());}
  // A failed parse can still contain an independently recognizable account reference.
  if(hints.isEmpty()){var matches=BankParserSupport.PRODUCT.matcher(Objects.toString(rawText,""));while(matches.find())hints.add(matches.group());for(var a:accounts)if((provider==null||Objects.equals(a.provider(),provider))&&a.maskedReference()!=null&&!a.maskedReference().isBlank()&&Objects.toString(rawText,"").contains(a.maskedReference()))hints.add(a.maskedReference());}
  if(provider==null){for(String hint:hints){var product=BankParserSupport.PRODUCT.matcher(hint);if(hint.equals(selected.maskedReference())||product.matches()&&Objects.equals(product.group(2),selected.suffix()))return Scope.RELEVANT;}return Scope.UNRELATED;}
  boolean unresolved=false,resolvedOther=false;var resolver=new MoneyAccountResolver();
  for(String hint:hints){var resolution=resolver.resolve(accounts,provider,hint);if(!resolution.resolved())unresolved=true;else if(resolution.account().id().equals(selected.id()))return Scope.RELEVANT;else resolvedOther=true;}
  if(resolvedOther&&!unresolved)return Scope.UNRELATED;
  return Scope.UNRESOLVED;
 }
}
