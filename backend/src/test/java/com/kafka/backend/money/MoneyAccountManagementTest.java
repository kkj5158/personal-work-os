package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class MoneyAccountManagementTest {
 final UUID owner=UUID.randomUUID(),id=UUID.randomUUID();
 final JdbcTemplate db=mock(JdbcTemplate.class);final MoneyService money=mock(MoneyService.class);
 final MoneyAccountManagementService service=new MoneyAccountManagementService(db,()->owner,money);
 MoneyAccountManagementTest(){when(money.account(id)).thenReturn(new MoneyAccount(id,"IBK","Synthetic",AccountRole.SPENDING,null,null,false,4));}
 @Test void staleVersionAndUnknownOwnerCannotDelete(){
  assertThatThrownBy(()->service.delete(id,new MoneyAccountManagementService.DeleteInput(3L))).isInstanceOf(OptimisticLockConflictException.class);
  verify(db,never()).update(anyString(),any(Object[].class));
  when(money.account(id)).thenThrow(new ResourceNotFoundException("Missing"));
  assertThatThrownBy(()->service.eligibility(id)).isInstanceOf(ResourceNotFoundException.class);
 }
 @Test void transactionEvenExcludedOrMergedBlocksDeletion(){
  when(db.queryForObject(contains("money_transactions"),eq(Boolean.class),any(Object[].class))).thenReturn(true);
  var result=service.eligibility(id);assertThat(result.allowed()).isFalse();assertThat(result.reasons()).contains("거래 이력");
  assertThatThrownBy(()->service.delete(id,new MoneyAccountManagementService.DeleteInput(4L))).isInstanceOf(InvalidRequestException.class);
  verify(db,never()).update(anyString(),any(Object[].class));
 }
 @Test void onlyUnreferencedAccountDeletesOwnerAndVersionScopedRow(){
  assertThat(service.eligibility(id).allowed()).isTrue();
  service.delete(id,new MoneyAccountManagementService.DeleteInput(4L));
  verify(db).update("delete from money_accounts where user_id=? and id=? and version=?",owner,id,4L);
  verify(db,never()).update(contains("money_transactions"),any(Object[].class));
 }
 @Test void historyRequiresOwnedAccountBeforeQuery(){
  when(money.account(id)).thenThrow(new ResourceNotFoundException("Missing"));
  assertThatThrownBy(()->service.history(id)).isInstanceOf(ResourceNotFoundException.class);
  verifyNoInteractions(db);
 }
}
