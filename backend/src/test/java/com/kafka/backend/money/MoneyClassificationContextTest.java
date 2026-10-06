package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
class MoneyClassificationContextTest {
 @Test void spellingCorrectionDoesNotChangePurchaseMeaningButNewGoodsDo(){
  assertThat(MoneyClassificationContext.sameMeaning("카페에서커피와간식구매","카페에서커피와간싣구매")).isTrue();
  assertThat(MoneyClassificationContext.sameMeaning("카페에서커피와간식구매","마트에서생활용품구매")).isFalse();
  assertThat(MoneyClassificationContext.normalize("Ｃａｆｅ · 커피 １２３")).isEqualTo("cafe커피123");
 }
 @Test void personalAndIntermediaryNamesAndFullMemoNeverBecomeProviderInput(){
  var row=new LinkedHashMap<String,Object>();row.put("type","EXPENSE");row.put("counterpartyText","김개인");row.put("title","김개인 선물");row.put("memo","전화 01012345678 · 계좌 999999999 · 김개인 커피");row.put("amount",100000);row.put("accountId",UUID.randomUUID());
  var safe=MoneyClassificationContext.minimized(row,List.of());assertThat(safe.toString()).doesNotContain("김개인","01012345678","999999999","100000");assertThat((Set<String>)safe.get("purchaseTerms")).contains("커피","선물");
  row.put("counterpartyText","네이버페이");assertThat(MoneyClassificationContext.minimized(row,List.of()).get("merchant")).isEqualTo("다품목 또는 결제 중개 사업체");
 }
 @Test void conversationMinimizesSelectedPrivateIdentityFullMemoAndContacts(){
  var book=Map.<String,Object>of("counterpartyText","김개인","accountDisplayName","개인 주거래 계좌","memo","비공개 메모 전체");
  var rule=Map.<String,Object>of("conditions",List.of(Map.of("field","merchant","value","이개인")));
  var safe=MoneyClassificationContext.conversationText("김개인·이개인 커피 선물을 개인 주거래 계좌에서 비공개 메모 전체, 01012345678 또는 private@example.test를 참고해 설명해 주세요.",List.of(book),List.of(rule));
  assertThat(safe).doesNotContain("김개인","이개인","개인 주거래 계좌","비공개 메모 전체","01012345678","private@example.test").contains("커피 선물","설명해 주세요");
 }
 @Test void accountTypeAndPurchaseContextRemainIndependentAcrossSameMerchant(){
  var a=new LinkedHashMap<String,Object>();a.put("accountId","one");a.put("type","EXPENSE");a.put("counterpartyText","쿠팡");a.put("title","간식");a.put("memo","");var b=new LinkedHashMap<>(a);b.put("title","생활용품");assertThat(MoneyClassificationContext.local(a)).isNotEqualTo(MoneyClassificationContext.local(b));b.put("title","간식");b.put("accountId","two");assertThat(MoneyClassificationContext.local(a)).isNotEqualTo(MoneyClassificationContext.local(b));
 }
}
