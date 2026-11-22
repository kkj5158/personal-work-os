package com.kafka.backend.money;

import com.kafka.backend.common.CurrentUserProvider;
import com.kafka.backend.common.OptimisticLockConflictException;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.datasource.DataSourceUtils;
import static com.kafka.backend.money.MoneyService.require;

/** A closed historical interval never replaces the current tracking lists. */
@Service
@Transactional(isolation=Isolation.REPEATABLE_READ)
public class MoneyTrackingHistoryService {
    public record Change(UUID accountId,String kind,boolean selected,LocalDate from,LocalDate through,Long expectedVersion,Instant asOf) {}
    public record Approval(Change change,String fingerprint) {}
    public record MonthImpact(String month,String currency,MoneyV4ReadService.Metrics flows,
                              MoneyStatisticalAccountService.Snapshot balances) {}
    private static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final MoneyMeaningService meaning;
    private final MoneyV4ReadService flows;
    private final MoneyStatisticalAccountService balances;
    private final MoneyCommandService commands;

    public MoneyTrackingHistoryService(JdbcTemplate db,CurrentUserProvider users,MoneyMeaningService meaning,
            MoneyV4ReadService flows,MoneyStatisticalAccountService balances,MoneyCommandService commands){
        this.db=db;this.users=users;this.meaning=meaning;this.flows=flows;this.balances=balances;this.commands=commands;
    }
    public Map<String,Object> preview(Change change){return evaluate(change,null,false);}
    public Map<String,Object> apply(Approval approval){
        require(approval!=null&&approval.fingerprint()!=null,"미리보기 확인이 필요합니다.");
        return evaluate(approval.change(),approval.fingerprint(),true);
    }
    private Map<String,Object> evaluate(Change c,String approved,boolean apply){
        require(c!=null&&c.accountId()!=null&&Set.of("EXPENSE","INCOME","SAVINGS","INSTALLMENT").contains(Objects.toString(c.kind(),""))
            &&c.from()!=null&&c.through()!=null&&!c.from().isAfter(c.through())&&c.through().isBefore(LocalDate.now(SEOUL)),
            "계좌·추적 종류·종료된 한국시간 날짜 범위를 확인하세요.");
        require(c.asOf()!=null&&!c.asOf().isAfter(Instant.now())&&c.asOf().isAfter(Instant.now().minusSeconds(3600)),"최근 미리보기 조회 시각이 필요합니다.");
        UUID owner=users.getCurrentUserId();
        db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner);
        MoneyMeaningService.version(((Number)meaning.tracking().get("version")).longValue(),c.expectedVersion());
        var start=Timestamp.from(c.from().atStartOfDay(SEOUL).toInstant());
        var end=Timestamp.from(c.through().plusDays(1).atStartOfDay(SEOUL).toInstant());
        require(Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from money_accounts where user_id=? and id=? and created_at<=?)",Boolean.class,owner,c.accountId(),start)),"적용 기간에 존재한 소유 계좌를 선택하세요.");
        if(c.selected()&&Set.of("SAVINGS","INSTALLMENT").contains(c.kind())){
            boolean eligible=Boolean.TRUE.equals(db.queryForObject("""
                with boundaries(at) as (
                  select ?::timestamptz union select effective_at from money_account_fund_group_history
                   where user_id=? and account_id=? and effective_at>? and effective_at<?
                  union select recorded_at from money_account_subtype_corrections
                   where user_id=? and account_id=? and recorded_at>? and recorded_at<?)
                select bool_and(coalesce(h.fund_group='SAVINGS' and coalesce(c.corrected_subtype,h.savings_subtype)=?,false))
                from boundaries b left join lateral (select * from money_account_fund_group_history h
                  where h.user_id=? and h.account_id=? and h.effective_at<=b.at order by effective_at desc limit 1) h on true
                left join money_account_subtype_corrections c on c.user_id=h.user_id and c.account_id=h.account_id
                  and c.effective_at=h.effective_at and c.recorded_at<=b.at
                """,Boolean.class,start,owner,c.accountId(),start,end,owner,c.accountId(),start,end,
                c.kind().equals("SAVINGS")?"SAVINGS_ACCOUNT":"INSTALLMENT",owner,c.accountId()));
            require(eligible,"선택 기간 전체의 자금 구분·저축 세부 유형을 확인하세요.");
        }
        if(c.selected()){
            require(Boolean.TRUE.equals(db.queryForObject("""
                select coalesce((select not archived from money_statistical_membership_history
                  where user_id=? and account_id=? and effective_at<=? order by effective_at desc limit 1),false)
                and not exists(select 1 from money_statistical_membership_history where user_id=? and account_id=?
                  and archived and effective_at>? and effective_at<?)
                """,Boolean.class,owner,c.accountId(),start,owner,c.accountId(),start,end)),
                "적용 기간 전체에 활성 상태였다는 계좌 근거가 필요합니다.");
        }
        var months=new TreeSet<YearMonth>();
        for(var m=YearMonth.from(c.from());!m.isAfter(YearMonth.from(c.through()));m=m.plusMonths(1))months.add(m);
        // A later linked refund can move even when its month lies outside the corrected interval.
        if(c.kind().equals("EXPENSE"))db.queryForList("""
            select distinct to_char(r.occurred_at at time zone 'Asia/Seoul','YYYY-MM')
            from money_transactions t join money_transactions r on r.user_id=t.user_id and r.refund_of=t.id
            where t.user_id=? and t.from_account_id=? and t.occurred_at>=? and t.occurred_at<?
            """,String.class,owner,c.accountId(),start,end).forEach(m->months.add(YearMonth.parse(m)));
        var currencies=new TreeSet<>(db.queryForList("select distinct currency from money_transactions where user_id=?",String.class,owner));
        currencies.add("KRW");
        var before=impact(months,currencies,c.asOf());
        var connection=DataSourceUtils.getConnection(Objects.requireNonNull(db.getDataSource()));
        try {
        var point=connection.setSavepoint();
        db.update("insert into money_tracking_settings(user_id,version) values(?,1) on conflict(user_id) do update set version=money_tracking_settings.version+1",owner);
        db.update("insert into money_tracking_interval_corrections(user_id,account_id,kind,valid_from,valid_until,selected,version) values(?,?,?,?,?,?,?)",
            owner,c.accountId(),c.kind(),start,end,c.selected(),c.expectedVersion()+1);
        var after=impact(months,currencies,c.asOf());
        var proof=commands.fingerprint(List.of(owner,c,before,after));
        if(!apply){connection.rollback(point);}
        connection.releaseSavepoint(point);
        if(apply){
            if(!proof.equals(approved))throw new OptimisticLockConflictException("거래·잔액 또는 설정이 변경되었습니다. 다시 미리보기 하세요.");
            meaning.audit(c.accountId(),"TRACKING_HISTORY",Map.of("version",c.expectedVersion()),Map.of("change",c,"fingerprint",proof));
        }
        return Map.of("before",before,"after",after,"fingerprint",proof,"applied",apply);
        }catch(java.sql.SQLException error){throw new org.springframework.jdbc.UncategorizedSQLException("추적 이력 미리보기",null,error);}
        finally{DataSourceUtils.releaseConnection(connection,db.getDataSource());}
    }
    private List<MonthImpact> impact(Set<YearMonth> months,Set<String> currencies,Instant asOf){
        var rows=new ArrayList<MonthImpact>();
        for(var month:months)for(var currency:currencies){
            var close=month.atEndOfMonth();
            rows.add(new MonthImpact(month.toString(),currency,flows.summary(month.atDay(1),close,currency,null),
                balances.snapshot(close,currency,null,asOf)));
        }
        return rows;
    }
}
