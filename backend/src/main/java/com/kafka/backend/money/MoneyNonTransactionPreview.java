package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** Read-only exclusion simulation reuses the actual anchor, effective-time and ledger balance calculation. */
@Service
@Transactional(readOnly=true)
public class MoneyNonTransactionPreview {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyService money;private final MoneyProductService product;private final MoneyWebService web;private final ObjectMapper json;
 public MoneyNonTransactionPreview(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyProductService product,MoneyWebService web,ObjectMapper json){this.db=db;this.users=users;this.money=money;this.product=product;this.web=web;this.json=json;}
 public record Input(String recordType,UUID recordId,Long expectedVersion,Long expectedOverrideVersion,Long expectedProjectionVersion){}
 private static void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("기록이 변경되었습니다. 다시 미리보기 하세요.");}
 public Map<String,Object> preview(Input input){require(input!=null&&"TRANSACTION".equals(input.recordType())&&input.recordId()!=null,"Posted transaction required");var t=money.transaction(input.recordId());version(t.version(),input.expectedVersion());require(Set.of(TransactionType.EXPENSE,TransactionType.INCOME).contains(t.type())&&!t.excluded()&&t.mergedInto()==null,"Included expense or income required");var book=web.bookkeepingRow(t.id());version(((Number)book.get("version")).longValue(),input.expectedOverrideVersion());version(((Number)book.get("projectionVersion")).longValue(),input.expectedProjectionVersion());
  UUID account=t.fromAccountId()==null?t.toAccountId():t.fromAccountId();Instant asOf=Instant.now();var before=(MoneyProductService.Balance)product.accountBalances(asOf,account).getFirst().get("balance");var after=(MoneyProductService.Balance)product.accountBalances(asOf,account,t.id()).getFirst().get("balance");
  var accountImpact=Map.of("accountId",account,"beforeBalance",before.amount(),"afterBalance",after.amount(),"delta",after.amount().subtract(before.amount()),"currency",t.currency());
  boolean included=money.account(account).includeInStatistics();BigDecimal income=t.type()==TransactionType.INCOME&&included?t.amount().negate():BigDecimal.ZERO,consumption=t.type()==TransactionType.EXPENSE&&included?t.amount().negate():BigDecimal.ZERO;
  long refunds=db.queryForObject("select count(*) from money_transactions where user_id=? and refund_of=? and not excluded",Long.class,users.getCurrentUserId(),t.id());
  String history=db.queryForObject("select md5(coalesce(string_agg(id::text||':'||version::text,',' order by id),'')) from money_transactions where user_id=? and (from_account_id=? or to_account_id=?)",String.class,users.getCurrentUserId(),account,account);
  var fingerprintData=new LinkedHashMap<String,Object>();fingerprintData.put("transaction",t);fingerprintData.put("accountVersion",money.account(account).version());fingerprintData.put("bookVersions",List.of(input.expectedOverrideVersion(),input.expectedProjectionVersion()));fingerprintData.put("history",history);fingerprintData.put("before",before);fingerprintData.put("after",after);fingerprintData.put("refunds",refunds);
  String fingerprint;try{fingerprint=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(fingerprintData).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}
  boolean valid=refunds==0&&"KRW".equals(t.currency());var warnings=new ArrayList<String>();warnings.add("원본과 감사 이력은 보존됩니다. 이후 기준점이 있으면 현재 잔액 영향은 0일 수 있습니다.");if(refunds>0)warnings.add("연결된 환불을 먼저 정정하세요.");if(!"KRW".equals(t.currency()))warnings.add("이 통화는 전용 금융 정정 지원이 필요합니다.");return Map.of("fingerprint",fingerprint,"accountImpacts",List.of(accountImpact),"statisticsImpact",Map.of("incomeDelta",income,"consumptionDelta",consumption),"warnings",warnings,"canConfirm",valid);
 }
}
