package com.kafka.backend.money;
import org.junit.jupiter.api.Test;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyReconciliationEvidenceScope.*;
import static org.assertj.core.api.Assertions.*;
class MoneyReconciliationEvidenceScopeTest {
 private final MoneyAccount selected=new MoneyAccount(UUID.randomUUID(),"KAKAO","입출금통장",AccountRole.SPENDING,null,"8557",false,0);
 private final MoneyAccount other=new MoneyAccount(UUID.randomUUID(),"KAKAO","자유적금",AccountRole.SAVINGS,null,"4851",false,0);
 @Test void unrelatedProviderAndRecognizedOtherAccountStayOutsideSelectedInvestigation(){
  assertThat(resolve(selected,List.of(selected,other),null,"com.ibk.android.ionebank","출금 1,000원")).isEqualTo(Scope.UNRELATED);
  assertThat(resolve(selected,List.of(selected,other),null,"com.kakaobank.channel","자유적금(4851) 출금 확인 필요")).isEqualTo(Scope.UNRELATED);
 }
 @Test void selectedHintAndUnknownOwnershipRemainInvestigativeWithoutAssigningAnAccount(){
  assertThat(resolve(selected,List.of(selected,other),null,"com.kakaobank.channel","입출금통장(8557) 출금 확인 필요")).isEqualTo(Scope.RELEVANT);
  assertThat(resolve(selected,List.of(selected,other),null,"com.kakaobank.channel","출금 확인 필요")).isEqualTo(Scope.UNRESOLVED);
  assertThat(resolve(selected,List.of(selected,other),null,"unknown.source","다른 앱의 합성 안내")).isEqualTo(Scope.UNRELATED);
  assertThat(resolve(selected,List.of(selected,other),null,"unknown.source","입출금통장(8557) 출금 확인 필요")).isEqualTo(Scope.RELEVANT);
 }
}
