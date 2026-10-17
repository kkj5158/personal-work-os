package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** Currency-separated projections. No implicit exchange rate or won aggregate of foreign units. */
@RestController
@RequestMapping("/api/money/mobile")
@Transactional(readOnly=true)
public class MoneyCurrencyController {
    private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyService money;
    public MoneyCurrencyController(JdbcTemplate db,CurrentUserProvider users,MoneyService money){this.db=db;this.users=users;this.money=money;}
    @GetMapping("/currencies") public List<String> currencies(){
        return db.queryForList("select currency from (select distinct currency from money_transactions where user_id=? and not excluded and merged_into is null union select 'KRW') c order by currency",String.class,users.getCurrentUserId());
    }
    @GetMapping("/accounts/{id}/currency-movements") public List<Map<String,Object>> movements(@PathVariable UUID id){
        money.account(id);
        return db.queryForList("select currency,sum(case when to_account_id=? then amount else -amount end) amount from money_transactions where user_id=? and (from_account_id=? or to_account_id=?) and not excluded and merged_into is null and type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') group by currency order by currency",id,users.getCurrentUserId(),id,id);
    }
}
