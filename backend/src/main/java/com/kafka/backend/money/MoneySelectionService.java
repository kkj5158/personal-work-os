package com.kafka.backend.money;
import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import static com.kafka.backend.money.MoneyService.require;
@Service
public class MoneySelectionService {
 private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyCommandService commands;
 public MoneySelectionService(JdbcTemplate db,CurrentUserProvider users,MoneyCommandService commands){this.db=db;this.users=users;this.commands=commands;}
 public record Selection(UUID requestId,String scope,List<UUID> ids){}
 private void scope(String value){require(Set.of("book-workbench-EXPENSE","book-workbench-INCOME","book-monthly-EXPENSE","book-monthly-INCOME").contains(Objects.toString(value,"")),"가계부 선택 범위를 확인하세요.");}
 @Transactional(readOnly=true) public Map<String,Object> read(String scope){scope(scope);return Map.of("ids",db.queryForList("select transaction_id from money_workbench_selections where user_id=? and scope=? order by selected_at,transaction_id",UUID.class,users.getCurrentUserId(),scope));}
 public Map<String,Object> save(Selection input){require(input!=null&&input.ids()!=null&&input.ids().size()<=10000&&input.ids().stream().allMatch(Objects::nonNull)&&new HashSet<>(input.ids()).size()==input.ids().size(),"서로 다른 최대 10,000개 선택 ID가 필요합니다.");scope(input.scope());
  return commands.execute(users.getCurrentUserId(),input.requestId(),"WORKBENCH_SELECTION",input,()->{
   UUID owner=users.getCurrentUserId();UUID[] ids=input.ids().toArray(UUID[]::new);
   require(db.queryForObject("select count(*) from money_transactions where user_id=? and id=any(?)",Long.class,owner,ids)==ids.length,"소유한 거래만 선택할 수 있습니다.");
   db.update("delete from money_workbench_selections where user_id=? and scope=? and not(transaction_id=any(?))",owner,input.scope(),ids);
   if(ids.length>0)db.update("insert into money_workbench_selections(user_id,scope,transaction_id) select ?,?,unnest(?) on conflict do nothing",owner,input.scope(),ids);
   return read(input.scope());
  });
 }
}
