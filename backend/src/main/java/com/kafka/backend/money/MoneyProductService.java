package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.*;

/** Owner-scoped product operations on the existing canonical ledger. */
@Service
@Transactional
public class MoneyProductService {
    private final JdbcTemplate db; private final CurrentUserProvider users; private final MoneyService money; private final ObjectMapper json;
    public MoneyProductService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,ObjectMapper json){this.db=db;this.users=users;this.money=money;this.json=json;}
    private UUID owner(){return users.getCurrentUserId();}
    private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
    private static void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("기록이 변경되었습니다. 새로고침 후 다시 저장하세요.");}
    public record Category(UUID id,String name,String color,boolean archived,long version){}
    public record CategoryInput(String name,String color,boolean archived,Long expectedVersion){}
    public record Rule(UUID id,String merchant,UUID categoryId,long version){}
    public record RuleInput(String merchant,UUID categoryId,Long expectedVersion){}
    public record Entry(TransactionType type,UUID fromAccountId,UUID toAccountId,BigDecimal amount,Instant occurredAt,
                        String counterpartyText,UUID categoryId,String memo,boolean excluded,UUID refundOf,Long expectedVersion){}
    public record Checkpoint(BigDecimal amount,Instant verifiedAt,String note,Long expectedVersion){}
    public record ReviewPost(Entry transaction,List<UUID> rawIds,List<Long> expectedVersions){}
    public record Pair(UUID otherId,Long expectedVersion,Long otherVersion){}
    public record Version(Long expectedVersion){}
    public record Balance(BigDecimal amount,String provenance,Instant asOf){}
    public record AccountView(MoneyAccount account,Balance balance,BigDecimal inflow,BigDecimal outflow,List<Map<String,Object>> counterparties,List<Map<String,Object>> checkpoints){}
    public record Page(List<MoneyTransaction> items,long total){}
    private Category category(UUID id){return categories().stream().filter(c->c.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Category not found"));}
    @Transactional(readOnly=true) public List<Category> categories(){return db.query("select * from money_categories where user_id=? order by name,id",(r,n)->new Category(r.getObject("id",UUID.class),r.getString("name"),r.getString("color"),r.getBoolean("archived"),r.getLong("version")),owner());}
    public List<Category> initializeCategories(){lock();String[] names={"식비","생활","교통","쇼핑","건강","여가","업무","구독·통신","기타"};String[] colors={"#ef8655","#eab94d","#58a4a0","#887ac4","#67ad79","#da85ac","#668bb5","#8e9c62","#94a3b8"};
        for(int i=0;i<names.length;i++)db.update("insert into money_categories(id,user_id,name,color) values(?,?,?,?) on conflict(user_id,name) do nothing",UUID.randomUUID(),owner(),names[i],colors[i]);return categories();}
    public Category saveCategory(UUID id,CategoryInput v){lock();require(v!=null,"Category required");text(v.name(),80,true,"Name");require(v.color()!=null&&v.color().matches("#[0-9a-fA-F]{6}"),"Invalid color");
        if(id==null){id=UUID.randomUUID();db.update("insert into money_categories(id,user_id,name,color) values(?,?,?,?)",id,owner(),v.name().strip(),v.color());}
        else{version(category(id).version(),v.expectedVersion());db.update("update money_categories set name=?,color=?,archived=?,version=version+1 where user_id=? and id=?",v.name().strip(),v.color(),v.archived(),owner(),id);}return category(id);}
    @Transactional(readOnly=true) public List<Rule> rules(){return db.query("select * from money_category_rules where user_id=? order by merchant,id",(r,n)->new Rule(r.getObject("id",UUID.class),r.getString("merchant"),r.getObject("category_id",UUID.class),r.getLong("version")),owner());}
    public Rule saveRule(UUID id,RuleInput v){lock();require(v!=null,"Rule required");text(v.merchant(),500,true,"Merchant");require(v.categoryId()!=null&&!category(v.categoryId()).archived(),"Active category required");String merchant=v.merchant().strip().toLowerCase(Locale.ROOT);
        if(id==null){id=UUID.randomUUID();db.update("insert into money_category_rules(id,user_id,merchant,category_id) values(?,?,?,?)",id,owner(),merchant,v.categoryId());}
        else{Rule old=rule(id);version(old.version(),v.expectedVersion());db.update("update money_category_rules set merchant=?,category_id=?,version=version+1 where user_id=? and id=?",merchant,v.categoryId(),owner(),id);}return rule(id);}
    private Rule rule(UUID id){return rules().stream().filter(r->r.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Rule not found"));}
    public void deleteRule(UUID id,Long expected){lock();version(rule(id).version(),expected);db.update("delete from money_category_rules where user_id=? and id=?",owner(),id);}
    private void validate(Entry e,UUID id){require(e!=null&&e.type()!=null&&e.occurredAt()!=null,"Type and time required");amount(e.amount());text(e.memo(),2000,false,"Memo");text(e.counterpartyText(),500,false,"Counterparty");
        boolean shape=switch(e.type()){case INCOME,REFUND->e.fromAccountId()==null&&e.toAccountId()!=null;case EXPENSE->e.fromAccountId()!=null&&e.toAccountId()==null;case TRANSFER->e.fromAccountId()!=null&&e.toAccountId()!=null&&!e.fromAccountId().equals(e.toAccountId());};require(shape,"Account selection does not match type");
        for(UUID a:Arrays.asList(e.fromAccountId(),e.toAccountId()))if(a!=null)require(!money.account(a).archived(),"Account is archived");
        if(e.categoryId()!=null)require(!category(e.categoryId()).archived()&&(e.type()==TransactionType.EXPENSE||e.type()==TransactionType.REFUND),"Category applies to consumption only");
        require(e.refundOf()==null||e.type()==TransactionType.REFUND,"Only refunds can link an expense");
        if(e.refundOf()!=null){var original=money.transaction(e.refundOf());require(original.type()==TransactionType.EXPENSE&&!original.excluded()&&!Objects.equals(original.id(),id),"Link an included expense");require(!e.occurredAt().isBefore(original.occurredAt()),"Refund must follow expense");
            BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and excluded=false and id<>?",BigDecimal.class,owner(),original.id(),id==null?UUID.randomUUID():id);
            require(e.excluded()||refunded.add(e.amount()).compareTo(original.amount())<=0,"Refund exceeds remaining expense");}
        if(id!=null){BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and excluded=false",BigDecimal.class,owner(),id);
            require(refunded.signum()==0||(e.type()==TransactionType.EXPENSE&&!e.excluded()&&e.amount().compareTo(refunded)>=0),"Resolve linked refunds before changing the expense");}
    }
    private void audit(MoneyTransaction old,String action){db.update("insert into money_corrections(id,user_id,transaction_id,action,previous_value) values(?,?,?,?,cast(? as jsonb))",UUID.randomUUID(),owner(),old.id(),action,json.writeValueAsString(old));}
    public MoneyTransaction save(UUID id,Entry e){lock();require(e!=null,"Transaction required");MoneyTransaction old=id==null?null:money.transaction(id);if(old!=null){version(old.version(),e.expectedVersion());require(old.mergedInto()==null,"Edit the linked transfer instead");require("KRW".equals(old.currency()),"V1 edits support KRW only");}validate(e,id);
        UUID category=e.categoryId();if(e.refundOf()!=null)category=money.transaction(e.refundOf()).categoryId();
        if(id==null){id=UUID.randomUUID();db.update("insert into money_transactions(id,user_id,type,from_account_id,to_account_id,amount,currency,occurred_at,counterparty_text,category_id,memo,excluded,manual,refund_of) values(?,?,?,?,?,?,'KRW',?,?,?,?,?,true,?)",id,owner(),e.type().name(),e.fromAccountId(),e.toAccountId(),e.amount(),Timestamp.from(e.occurredAt()),e.counterpartyText(),category,e.memo(),e.excluded(),e.refundOf());money.applyCategoryRule(id);}
        else{audit(old,"EDIT");db.update("update money_transactions set type=?,from_account_id=?,to_account_id=?,amount=?,occurred_at=?,counterparty_text=?,category_id=?,memo=?,excluded=?,refund_of=?,version=version+1 where user_id=? and id=?",e.type().name(),e.fromAccountId(),e.toAccountId(),e.amount(),Timestamp.from(e.occurredAt()),e.counterpartyText(),category,e.memo(),e.excluded(),e.refundOf(),owner(),id);}
        if(e.type()==TransactionType.EXPENSE) {
            var refunds=db.queryForList("select id from money_transactions where user_id=? and refund_of=? and category_id is distinct from ?",UUID.class,owner(),id,category);
            for(UUID refund:refunds){audit(money.transaction(refund),"REFUND_CATEGORY_SYNC");db.update("update money_transactions set category_id=?,version=version+1 where user_id=? and id=?",category,owner(),refund);}
        }
        return money.transaction(id);
    }
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset){return transactions(from,to,accountId,categoryId,type,search,includeExcluded,limit,offset,false);}
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset,boolean uncategorized){page(limit,offset);List<Object> args=new ArrayList<>();args.add(owner());StringBuilder sql=new StringBuilder(" from money_transactions t where t.user_id=?");
        if(!includeExcluded)sql.append(" and t.excluded=false");if(uncategorized)sql.append(" and t.type='EXPENSE' and t.category_id is null");
        if(from!=null&&!from.isBlank()){sql.append(" and occurred_at>=?");args.add(Timestamp.from(LocalDate.parse(from).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));}
        if(to!=null&&!to.isBlank()){sql.append(" and occurred_at<?");args.add(Timestamp.from(LocalDate.parse(to).plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));}
        if(accountId!=null){money.account(accountId);sql.append(" and (from_account_id=? or to_account_id=?)");args.add(accountId);args.add(accountId);}
        if(categoryId!=null){category(categoryId);sql.append(" and category_id=?");args.add(categoryId);}
        if(type!=null){sql.append(" and type=?");args.add(type.name());}
        if(search!=null&&!search.isBlank()){text(search,200,false,"Search");sql.append(" and (position(lower(?) in lower(coalesce(counterparty_text,'')||' '||coalesce(memo,'')))>0)");args.add(search);}
        long total=db.queryForObject("select count(*)"+sql,Long.class,args.toArray());args.add(limit);args.add(offset);
        var ids=db.queryForList("select t.id"+sql+" order by occurred_at desc,id limit ? offset ?",UUID.class,args.toArray());return new Page(ids.stream().map(money::transaction).toList(),total);
    }
    private Instant[] month(String value){try{var m=YearMonth.parse(value);return new Instant[]{m.atDay(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),m.plusMonths(1).atDay(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()};}catch(RuntimeException e){throw new InvalidRequestException("Use YYYY-MM");}}
    private List<MoneyTransaction> monthRows(String month){var dates=month(month);return db.queryForList("select id from money_transactions where user_id=? and excluded=false and occurred_at>=? and occurred_at<? order by occurred_at,id",UUID.class,owner(),Timestamp.from(dates[0]),Timestamp.from(dates[1])).stream().map(money::transaction).toList();}
    static boolean savings(AccountRole role){return role==AccountRole.SAVINGS||role==AccountRole.PURPOSE_SAVINGS||role==AccountRole.PURPOSE_INSTALLMENT;}
    @Transactional(readOnly=true) public Map<String,Object> dashboard(String month){var rows=monthRows(month);var accounts=money.accounts();Map<UUID,MoneyAccount> byId=new HashMap<>();accounts.forEach(a->byId.put(a.id(),a));BigDecimal income=BigDecimal.ZERO,consumption=BigDecimal.ZERO,savings=BigDecimal.ZERO;Map<String,BigDecimal> amounts=new LinkedHashMap<>();
        for(var t:rows){if(t.type()==TransactionType.INCOME)income=income.add(t.amount());if(t.type()==TransactionType.EXPENSE||t.type()==TransactionType.REFUND){BigDecimal delta=t.type()==TransactionType.REFUND?t.amount().negate():t.amount();consumption=consumption.add(delta);UUID cat=t.refundOf()!=null?money.transaction(t.refundOf()).categoryId():t.categoryId();amounts.merge(cat==null?"uncategorized":cat.toString(),delta,BigDecimal::add);}
            if(t.type()==TransactionType.TRANSFER){boolean src=savings(byId.get(t.fromAccountId()).role()),dst=savings(byId.get(t.toAccountId()).role());if(src!=dst)savings=savings.add(dst?t.amount():t.amount().negate());}}
        return Map.of("month",month,"income",income,"consumption",consumption,"savingsMovement",savings,"categories",amounts,"reviewCount",reviewCount(),"flow",flow(rows));
    }
    private List<Map<String,Object>> flow(List<MoneyTransaction> rows){Map<String,Map<String,Object>> grouped=new LinkedHashMap<>();for(var t:rows)if(t.type()==TransactionType.TRANSFER){String key=t.fromAccountId()+":"+t.toAccountId();var row=grouped.computeIfAbsent(key,k->new LinkedHashMap<>(Map.of("fromAccountId",t.fromAccountId(),"toAccountId",t.toAccountId(),"amount",BigDecimal.ZERO)));row.put("amount",((BigDecimal)row.get("amount")).add(t.amount()));}return new ArrayList<>(grouped.values());}
    @Transactional(readOnly=true) public Balance balance(UUID id){money.account(id);Instant at=Instant.EPOCH;BigDecimal base=BigDecimal.ZERO;String source="CALCULATED";
        var checkpoints=db.queryForList("select amount,verified_at from money_balance_checkpoints where user_id=? and account_id=? order by verified_at desc,created_at desc,id desc limit 1",owner(),id);
        if(!checkpoints.isEmpty()){base=(BigDecimal)checkpoints.getFirst().get("amount");at=((Timestamp)checkpoints.getFirst().get("verified_at")).toInstant();source="MANUALLY_VERIFIED";}
        // Only successfully posted sources tied to this account can establish a bank balance.
        var candidates=db.queryForList("select p.candidate::text from money_parse_attempts p join money_transaction_sources s on s.parse_attempt_id=p.id and s.user_id=p.user_id join money_transactions t on t.id=s.transaction_id and t.user_id=s.user_id where p.user_id=? and t.excluded=false and (t.from_account_id=? or t.to_account_id=?) and p.candidate->>'postBalance' is not null order by p.created_at desc",String.class,owner(),id,id);
        for(String value:candidates){var c=json.readValue(value,ParsedCandidate.class);String hint=c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint();var resolved=new MoneyAccountResolver().resolve(money.accounts(),c.provider(),hint);if(resolved.resolved()&&resolved.account().id().equals(id)&&c.postedAt()!=null&&c.postedAt().isAfter(at)){at=c.postedAt();base=c.postBalance();source="NOTIFICATION";}}
        BigDecimal delta=db.queryForObject("select coalesce(sum(case when to_account_id=? then amount else -amount end),0) from money_transactions where user_id=? and excluded=false and (from_account_id=? or to_account_id=?) and occurred_at>?",BigDecimal.class,id,owner(),id,id,Timestamp.from(at));
        if(delta.signum()!=0)source="CALCULATED_FROM_"+source;
        return new Balance(base.add(delta),source,at.equals(Instant.EPOCH)?null:at);
    }
    public Balance checkpoint(UUID id,Checkpoint v){lock();var a=money.account(id);require(v!=null&&v.amount()!=null&&v.amount().abs().compareTo(new BigDecimal("100000000000000000"))<0&&v.amount().stripTrailingZeros().scale()<=2,"Invalid balance");version(a.version(),v.expectedVersion());require(v.verifiedAt()!=null&&!v.verifiedAt().isAfter(Instant.now().plusSeconds(60)),"Verification time cannot be in the future");text(v.note(),500,false,"Note");db.update("insert into money_balance_checkpoints(id,user_id,account_id,amount,verified_at,note) values(?,?,?,?,?,?)",UUID.randomUUID(),owner(),id,v.amount(),Timestamp.from(v.verifiedAt()),v.note());db.update("update money_accounts set version=version+1,updated_at=now() where user_id=? and id=?",owner(),id);return balance(id);}
    @Transactional(readOnly=true) public AccountView accountDetail(UUID id,String month){var a=money.account(id);BigDecimal in=BigDecimal.ZERO,out=BigDecimal.ZERO;var txs=monthRows(month);for(var t:txs){if(id.equals(t.toAccountId()))in=in.add(t.amount());if(id.equals(t.fromAccountId()))out=out.add(t.amount());}
        var cps=db.queryForList("select id,amount,verified_at as \"verifiedAt\",note,created_at as \"createdAt\" from money_balance_checkpoints where user_id=? and account_id=? order by verified_at desc,created_at desc",owner(),id);
        return new AccountView(a,balance(id),in,out,flow(txs).stream().filter(f->id.equals(f.get("fromAccountId"))||id.equals(f.get("toAccountId"))).toList(),cps);}
    @Transactional(readOnly=true) public List<Map<String,Object>> accountBalances(){return money.accounts().stream().map(a->Map.<String,Object>of("account",a,"balance",balance(a.id()))).toList();}
    @Transactional(readOnly=true) public List<Map<String,Object>> balanceIssues(){
        List<Map<String,Object>> issues=new ArrayList<>();
        for(var a:money.accounts()) {
            if(a.archived())continue;
            var checkpoints=db.queryForList("select amount,verified_at from money_balance_checkpoints where user_id=? and account_id=? order by verified_at desc,created_at desc,id desc limit 1",owner(),a.id());
            if(checkpoints.isEmpty())continue;
            var current=balance(a.id());if(!current.provenance().contains("NOTIFICATION"))continue;
            var cp=checkpoints.getFirst();
            var change=db.queryForObject("select coalesce(sum(case when to_account_id=? then amount else -amount end),0) from money_transactions where user_id=? and excluded=false and (from_account_id=? or to_account_id=?) and occurred_at>?",BigDecimal.class,a.id(),owner(),a.id(),a.id(),cp.get("verified_at"));
            BigDecimal expected=((BigDecimal)cp.get("amount")).add(change);
            if(expected.compareTo(current.amount())!=0)issues.add(Map.of("accountId",a.id(),"expectedBalance",expected,"observedBalance",current.amount(),"difference",current.amount().subtract(expected)));
        }
        return issues;
    }
    private long reviewCount(){return balanceIssues().size()+db.queryForObject("select (select count(*) from money_raw_notifications where user_id=? and state in ('REVIEW_REQUIRED','FAILED'))+(select count(*) from money_transactions where user_id=? and excluded=false and type='EXPENSE' and category_id is null)",Long.class,owner(),owner());}
    @Transactional(readOnly=true) public Map<String,Object> review(int limit,int offset){page(limit,offset);var raws=db.queryForList("select id from money_raw_notifications where user_id=? and state in ('REVIEW_REQUIRED','FAILED') order by received_at,id limit ? offset ?",UUID.class,owner(),limit,offset);
        var txs=db.queryForList("select id from money_transactions where user_id=? and excluded=false and type='EXPENSE' and category_id is null order by occurred_at desc,id limit ? offset ?",UUID.class,owner(),limit,offset);
        return Map.of("raw",raws.stream().map(money::notification).toList(),"uncategorized",txs.stream().map(money::transaction).toList(),"total",reviewCount(),"balanceIssues",balanceIssues());}
    public MoneyTransaction reviewPost(ReviewPost v){lock();require(v!=null&&v.rawIds()!=null&&!v.rawIds().isEmpty()&&v.rawIds().size()<=2&&new HashSet<>(v.rawIds()).size()==v.rawIds().size()&&v.expectedVersions()!=null&&v.expectedVersions().size()==v.rawIds().size(),"Select one or two sources");
        for(int i=0;i<v.rawIds().size();i++){var raw=money.notification(v.rawIds().get(i));version(raw.processingVersion(),v.expectedVersions().get(i));require(raw.state()==ProcessingState.REVIEW_REQUIRED||raw.state()==ProcessingState.FAILED,"Only unresolved sources may be reviewed");}
        var tx=save(null,v.transaction());for(UUID raw:v.rawIds()){db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,relationship,evidence) values(?,?,?,'PRIMARY','{\"rule\":\"USER_CONFIRMED\"}')",tx.id(),owner(),raw);money.finishProcessing(raw,ProcessingState.PROCESSED,"USER_CONFIRMED");}db.update("update money_transactions set manual=false where user_id=? and id=?",owner(),tx.id());return money.transaction(tx.id());}
    public void reviewExclude(UUID id,Long expected){lock();var raw=money.notification(id);version(raw.processingVersion(),expected);require(raw.state()!=ProcessingState.PROCESSED,"Source already resolved");money.finishProcessing(id,ProcessingState.PROCESSED,"USER_EXCLUDED");}
    public void reprocess(UUID id,Long expected){lock();version(money.notification(id).processingVersion(),expected);money.requestReprocessing(id);}
    public MoneyTransaction link(UUID id,Pair v){lock();var a=money.transaction(id);var b=money.transaction(v.otherId());version(a.version(),v.expectedVersion());version(b.version(),v.otherVersion());require(!a.id().equals(b.id())&&!a.excluded()&&!b.excluded()&&a.amount().compareTo(b.amount())==0&&a.currency().equals(b.currency()),"Select two included sides with equal amount and currency");
        var out=a.type()==TransactionType.EXPENSE?a:b;var in=a.type()==TransactionType.INCOME?a:b;require(out.type()==TransactionType.EXPENSE&&in.type()==TransactionType.INCOME&&!out.fromAccountId().equals(in.toAccountId()),"Select an expense and income from different owned accounts");
        require(db.queryForObject("select count(*) from money_transactions where user_id=? and refund_of in (?,?)",Integer.class,owner(),id,b.id())==0,"Resolve refund links first");
        audit(a,"LINK_TRANSFER");audit(b,"LINK_TRANSFER");db.update("update money_transactions set type='TRANSFER',from_account_id=?,to_account_id=?,category_id=null,version=version+1 where user_id=? and id=?",out.fromAccountId(),in.toAccountId(),owner(),id);db.update("update money_transaction_sources set transaction_id=? where user_id=? and transaction_id=?",id,owner(),b.id());db.update("update money_transactions set excluded=true,merged_into=?,version=version+1 where user_id=? and id=?",id,owner(),b.id());return money.transaction(id);}
    public List<MoneyTransaction> unlink(UUID id,Long expected){lock();var t=money.transaction(id);version(t.version(),expected);require(t.type()==TransactionType.TRANSFER&&!t.excluded(),"Select an included transfer");audit(t,"UNLINK_TRANSFER");
          // Move IN evidence only when separate OUT evidence remains. A combined/single-side
          // notification stays on the original row, with the split recorded in correction history.
        db.update("update money_transactions set type='EXPENSE',to_account_id=null,version=version+1 where user_id=? and id=?",owner(),id);
        var second=save(null,new Entry(TransactionType.INCOME,null,t.toAccountId(),t.amount(),t.occurredAt(),t.counterpartyText(),null,"이체 분리: "+id,false,null,null));audit(second,"SPLIT_FROM_TRANSFER");
        db.update("update money_transaction_sources s set transaction_id=? from money_parse_attempts p where s.user_id=? and s.transaction_id=? and p.id=s.parse_attempt_id and p.user_id=s.user_id and p.direction='IN' and exists(select 1 from money_transaction_sources os join money_parse_attempts op on op.id=os.parse_attempt_id and op.user_id=os.user_id where os.user_id=s.user_id and os.transaction_id=s.transaction_id and op.direction='OUT')",second.id(),owner(),id);
        db.update("update money_transactions set manual=false where user_id=? and id=? and exists(select 1 from money_transaction_sources where user_id=? and transaction_id=?)",owner(),second.id(),owner(),second.id());
        return List.of(money.transaction(id),money.transaction(second.id()));}
    @Transactional(readOnly=true) public List<Map<String,Object>> corrections(UUID id){money.transaction(id);return db.queryForList("select action,previous_value as \"previousValue\",created_at as \"createdAt\" from money_corrections where user_id=? and transaction_id=? order by created_at,id",owner(),id);}
    @Transactional(readOnly=true) public Map<String,Object> status(){var result=new LinkedHashMap<String,Object>();result.put("server","CONNECTED");result.put("lastReceivedAt",db.queryForObject("select max(received_at) from money_raw_notifications where user_id=?",Timestamp.class,owner()));result.put("pending",db.queryForObject("select count(*) from money_raw_notifications where user_id=? and processing_due_at is not null",Long.class,owner()));result.put("reviewCount",reviewCount());result.put("bridge","알림 수신 시각 기준 · 휴대폰 연결 상태는 직접 확인하세요");return result;}
}
