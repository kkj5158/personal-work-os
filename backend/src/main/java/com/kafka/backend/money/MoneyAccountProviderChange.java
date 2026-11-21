package com.kafka.backend.money;

import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

import static com.kafka.backend.money.MoneyService.require;
import static com.kafka.backend.money.MoneyTypes.*;

/** The owner lock covers approval readback, historical route preservation and the account update. */
final class MoneyAccountProviderChange {
    record Impact(String currentProvider,String nextProvider,long version,long transactions,long linkedAlerts,
                  int preservedObservations,int reviewAlerts,int scheduledAlerts,boolean collision,String fingerprint) {}
    record Request(String provider,long expectedVersion,String fingerprint) {}
    record Route(UUID attempt,UUID raw,UUID account) {}
    record Plan(Impact impact,List<Route> routes) {}
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final UUID owner;

    MoneyAccountProviderChange(JdbcTemplate db,ObjectMapper json,UUID owner) {
        this.db=db;this.json=json;this.owner=owner;
    }

    Plan inspect(MoneyAccount current,MoneyAccount proposed,List<MoneyAccount> accounts) {
        var next=accounts.stream().map(a->a.id().equals(current.id())?proposed:a).toList();
        boolean collision=next.stream().anyMatch(a->!a.id().equals(proposed.id())
            &&a.provider().equals(proposed.provider())
            &&(proposed.displayName().equals(a.displayName())
                ||proposed.suffix()!=null&&proposed.suffix().equals(a.suffix())
                ||proposed.maskedReference()!=null&&proposed.maskedReference().equals(a.maskedReference())));
        long transactions=db.queryForObject("""
            select count(*) from money_transactions
            where user_id=? and not excluded and merged_into is null and (from_account_id=? or to_account_id=?)
            """,Long.class,owner,current.id(),current.id());
        long links=db.queryForObject("""
            select count(distinct s.raw_event_id) from money_transaction_sources s
            join money_transactions t on t.user_id=s.user_id and t.id=s.transaction_id
            where t.user_id=? and not t.excluded and t.merged_into is null and (t.from_account_id=? or t.to_account_id=?)
            """,Long.class,owner,current.id(),current.id());
        var routes=new ArrayList<Route>();
        db.query("""
            select p.id,p.raw_event_id,p.candidate::text from money_parse_attempts p
            left join money_provider_observation_routes h on h.user_id=p.user_id and h.parse_attempt_id=p.id
            where p.user_id=? and p.provider in (?,?) and p.direction is not null and h.parse_attempt_id is null
              and p.candidate->>'postBalance' is not null
            order by p.id
            """,r->{
            var c=json.readValue(r.getString("candidate"),ParsedCandidate.class);
            if(c.direction()==null)return;
            String hint=c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint();
            var before=resolve(accounts,c.provider(),hint);
            if(!Objects.equals(before,resolve(next,c.provider(),hint)))
                routes.add(new Route(r.getObject("id",UUID.class),r.getObject("raw_event_id",UUID.class),before));
        },owner,current.provider(),proposed.provider());
        var review=new ArrayList<UUID>();
        var scheduled=new ArrayList<UUID>();
        db.query("""
            select r.id,r.state,r.processing_due_at,p.candidate::text from money_raw_notifications r
            left join lateral(select candidate,provider from money_parse_attempts p where p.user_id=r.user_id and p.raw_event_id=r.id
                order by p.created_at desc,p.id desc limit 1) p on true
            where r.user_id=? and r.state<>'PROCESSED' and (r.source_package in (?,?) or p.provider in (?,?))
              and not exists(select 1 from money_transaction_sources s where s.user_id=r.user_id and s.raw_event_id=r.id)
            order by r.id
            """,r->{
            String candidate=r.getString("candidate");
            var c=candidate==null?null:json.readValue(candidate,ParsedCandidate.class);
            boolean queued="RECEIVED".equals(r.getString("state"))||r.getTimestamp("processing_due_at")!=null;
            boolean affected=c==null||c.direction()==null?queued
                :changed(accounts,next,c.provider(),c.sourceAccountHint())||changed(accounts,next,c.provider(),c.destinationAccountHint());
            if(affected)(queued?scheduled:review).add(r.getObject("id",UUID.class));
        },owner,MoneyOrdinaryAdmission.PACKAGES.getOrDefault(current.provider(),""),
            MoneyOrdinaryAdmission.PACKAGES.getOrDefault(proposed.provider(),""),
            current.provider(),proposed.provider());
        var fingerprint=digest(List.of(current.id(),current.version(),current.provider(),proposed.provider(),
            transactions,links,collision,routes,review,scheduled));
        return new Plan(new Impact(current.provider(),proposed.provider(),current.version(),transactions,links,
            routes.size(),review.size(),scheduled.size(),collision,fingerprint),routes);
    }

    void preserve(Plan plan) {
        require(!plan.impact().collision(),"새 금융기관에 같은 이름 또는 금융 식별 정보가 이미 등록되어 있습니다.");
        require(plan.impact().scheduledAlerts()==0,"연결 후보가 바뀌는 처리 중 알림이 있습니다. 처리 후 영향을 다시 확인하세요.");
        if(!plan.routes().isEmpty())db.batchUpdate("""
            insert into money_provider_observation_routes(user_id,parse_attempt_id,raw_event_id,account_id)
            values(?,?,?,?)
            """,plan.routes(),100,(ps,r)->{
            ps.setObject(1,owner);ps.setObject(2,r.attempt());ps.setObject(3,r.raw());ps.setObject(4,r.account());
        });
    }

    static UUID observationAccount(Object frozenAttempt,UUID frozenAccount,List<MoneyAccount> accounts,ParsedCandidate c) {
        if(frozenAttempt!=null)return frozenAccount;
        if(c==null||c.direction()==null)return null;
        return resolve(accounts,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());
    }

    private boolean changed(List<MoneyAccount> before,List<MoneyAccount> after,String provider,String hint) {
        return !Objects.equals(resolve(before,provider,hint),resolve(after,provider,hint));
    }

    private static UUID resolve(List<MoneyAccount> accounts,String provider,String hint) {
        var route=new MoneyAccountResolver().resolve(accounts,provider,hint).account();
        return route==null?null:route.id();
    }

    private String digest(Object value) {
        try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
            .digest(json.writeValueAsString(value).getBytes(StandardCharsets.UTF_8)));}
        catch(NoSuchAlgorithmException e){throw new IllegalStateException(e);}
    }
}
