package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.OptimisticLockConflictException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.time.Instant;
import static com.kafka.backend.money.MoneyService.require;

/** Owner-scoped account lifecycle. Historical ledger references are never deleted. */
@Service
@Transactional
public class MoneyAccountManagementService {
 private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyService money;
 public MoneyAccountManagementService(JdbcTemplate db,CurrentUserProvider users,MoneyService money){this.db=db;this.users=users;this.money=money;}
 private UUID owner(){return users.getCurrentUserId();}
 public record DeleteInput(Long expectedVersion){}
 public record DeletionEligibility(boolean allowed,List<String> reasons){}
 public record FundHistory(String fundGroup,String savingsSubtype,Instant effectiveAt,Instant recordedAt,long accountVersion){}
 @Transactional(readOnly=true) public List<FundHistory> history(UUID id){
  money.account(id);
  // PostgreSQL infinity is a baseline marker, not a Java Instant.
  return db.query("select fund_group,savings_subtype,case when effective_at='-infinity'::timestamptz then null else effective_at end effective_at,recorded_at,account_version from money_account_fund_group_history h where user_id=? and account_id=? order by h.effective_at desc",(r,n)->new FundHistory(r.getString("fund_group"),r.getString("savings_subtype"),r.getTimestamp("effective_at")==null?null:r.getTimestamp("effective_at").toInstant(),r.getTimestamp("recorded_at").toInstant(),r.getLong("account_version")),owner(),id);
 }
 @Transactional(readOnly=true) public DeletionEligibility eligibility(UUID id){
  money.account(id);var reasons=new ArrayList<String>();
  if(exists("select 1 from money_transactions where user_id=? and (from_account_id=? or to_account_id=?)",owner(),id,id))reasons.add("거래 이력");
  if(exists("select 1 from money_balance_checkpoints where user_id=? and account_id=?",owner(),id))reasons.add("잔액 기준점");
  if(exists("select 1 from money_accounts where user_id=? and funding_account_id=?",owner(),id))reasons.add("연결된 계좌");
  if(exists("select 1 from money_loans where user_id=? and payment_account_id=?",owner(),id))reasons.add("대출 참조");
  if(exists("select 1 from money_tracking_accounts where user_id=? and account_id=?",owner(),id))reasons.add("가계부 추적 설정");
  if(exists("select 1 from money_overview_preferences where user_id=? and ?=any(account_ids)",owner(),id))reasons.add("대표 계좌 설정");
  if(exists("select 1 from money_category_rules where user_id=? and conditions::text like ?",owner(),"%"+id+"%"))reasons.add("분류 규칙 참조");
  if(exists("select 1 from money_ai_events where user_id=? and (subject_id=? or payload::text like ?)",owner(),id,"%"+id+"%"))reasons.add("저장된 처리·설정 이력 참조");
  if(exists("select 1 from money_recommendation_runs where user_id=? and filters::text like ?",owner(),"%"+id+"%"))reasons.add("추천 범위 참조");
  if(exists("select 1 from money_account_fund_group_history where user_id=? and account_id=? and effective_at<>'-infinity'::timestamptz and account_version>0",owner(),id))reasons.add("자금 그룹 변경 이력");
  return new DeletionEligibility(reasons.isEmpty(),reasons);
 }
 private boolean exists(String sql,Object...args){return Boolean.TRUE.equals(db.queryForObject("select exists("+sql+")",Boolean.class,args));}
 public void delete(UUID id,DeleteInput input){
  db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());
  // The row lock also serializes new FK references while eligibility and delete run.
  db.queryForList("select id from money_accounts where user_id=? and id=? for update",owner(),id);
  var account=money.account(id);
  if(input==null||input.expectedVersion()==null||input.expectedVersion()!=account.version())throw new OptimisticLockConflictException("계좌가 변경되었습니다. 최신 상태를 확인하세요.");
  require(eligibility(id).allowed(),"거래 또는 참조가 있는 계좌는 삭제할 수 없습니다. 보관을 사용하세요.");
  db.update("delete from money_accounts where user_id=? and id=? and version=?",owner(),id,input.expectedVersion());
 }
}
