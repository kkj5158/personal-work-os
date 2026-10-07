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
    public record Category(UUID id,String name,String color,boolean archived,long version,String kind,String emoji,int sortOrder,boolean seeded,UUID parentId,boolean effectiveArchived,UUID structuralGroupId,String iconType,String iconValue){
      public Category(UUID id,String name,String color,boolean archived,long version,String kind,String emoji,int sortOrder,boolean seeded,UUID parentId,boolean effectiveArchived){this(id,name,color,archived,version,kind,emoji,sortOrder,seeded,parentId,effectiveArchived,null,emoji==null?null:"EMOJI",emoji);}
    }
    public record CategoryInput(String name,String color,boolean archived,Long expectedVersion,String kind,String emoji,Integer sortOrder,UUID parentId,Boolean confirmDeactivate,String iconType,String iconValue){
      public CategoryInput(String name,String color,boolean archived,Long expectedVersion,String kind,String emoji,Integer sortOrder,UUID parentId,Boolean confirmDeactivate){this(name,color,archived,expectedVersion,kind,emoji,sortOrder,parentId,confirmDeactivate,null,null);}
      public CategoryInput(String name,String color,boolean archived,Long expectedVersion){this(name,color,archived,expectedVersion,"EXPENSE",null,0,null,false);}
      public CategoryInput(String name,String color,boolean archived,Long expectedVersion,String kind,String emoji,Integer sortOrder){this(name,color,archived,expectedVersion,kind,emoji,sortOrder,null,false);}
    }
    public record Rule(UUID id,String merchant,UUID categoryId,long version,String titleDefault,String memoDefault,boolean enabled){}
    public record RuleInput(String merchant,UUID categoryId,Long expectedVersion,String titleDefault,String memoDefault,Boolean enabled){
        public RuleInput(String merchant,UUID categoryId,Long expectedVersion){this(merchant,categoryId,expectedVersion,null,null,true);}
    }
    public record Entry(TransactionType type,UUID fromAccountId,UUID toAccountId,BigDecimal amount,Instant occurredAt,
                        String counterpartyText,UUID categoryId,String memo,boolean excluded,UUID refundOf,Long expectedVersion,String title){
        public Entry(TransactionType type,UUID fromAccountId,UUID toAccountId,BigDecimal amount,Instant occurredAt,String counterpartyText,UUID categoryId,String memo,boolean excluded,UUID refundOf,Long expectedVersion){this(type,fromAccountId,toAccountId,amount,occurredAt,counterpartyText,categoryId,memo,excluded,refundOf,expectedVersion,null);}
    }
    public record Checkpoint(BigDecimal amount,Instant verifiedAt,String note,Long expectedVersion){}
    public record ReviewPost(Entry transaction,List<UUID> rawIds,List<Long> expectedVersions){}
    public record Pair(UUID otherId,Long expectedVersion,Long otherVersion){}
    public record Version(Long expectedVersion){}
    public record Balance(BigDecimal amount,String provenance,Instant asOf){}
    public record AccountView(MoneyAccount account,Balance balance,BigDecimal inflow,BigDecimal outflow,List<Map<String,Object>> counterparties,List<Map<String,Object>> checkpoints,List<MoneyTransaction> transactions,int historyCount){}
    public record Page(List<MoneyTransaction> items,long total){}
    private Category category(UUID id){return categories().stream().filter(c->c.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Category not found"));}
    private MoneyCategories hierarchy(){return new MoneyCategories(db,owner(),json);}
    @Transactional(readOnly=true) public List<Category> categories(){return hierarchy().list();}
    public List<Category> initializeCategories(){lock();return hierarchy().defaults();}
    public Category saveCategory(UUID id,CategoryInput input){lock();return hierarchy().save(id,input);}
    @Transactional(readOnly=true) public MoneyCategories.Impact categoryImpact(UUID id){return hierarchy().impact(id);}
    public Category moveCategory(UUID id,MoneyCategories.Move input){lock();return hierarchy().move(id,input);}
    public List<Category> orderCategories(MoneyCategories.Order input){lock();return hierarchy().order(input);}
    @Transactional(readOnly=true) public List<Rule> rules(){return db.query("select * from money_category_rules where user_id=? order by merchant,id",(r,n)->new Rule(r.getObject("id",UUID.class),r.getString("merchant"),r.getObject("category_id",UUID.class),r.getLong("version"),r.getString("title_default"),r.getString("memo_default"),r.getBoolean("enabled")),owner());}
    public Rule saveRule(UUID id,RuleInput v){lock();require(v!=null,"Rule required");text(v.merchant(),500,true,"Merchant");require(v.categoryId()!=null&&!category(v.categoryId()).effectiveArchived(),"Active category required");String merchant=v.merchant().strip().toLowerCase(Locale.ROOT);
        if(id==null){id=UUID.randomUUID();db.update("insert into money_category_rules(id,user_id,merchant,category_id) values(?,?,?,?)",id,owner(),merchant,v.categoryId());}
        else{Rule old=rule(id);version(old.version(),v.expectedVersion());db.update("update money_category_rules set merchant=?,category_id=?,version=version+1 where user_id=? and id=?",merchant,v.categoryId(),owner(),id);}
        text(v.titleDefault(),240,false,"Title default");text(v.memoDefault(),2000,false,"Memo default");
        db.update("update money_category_rules set title_default=?,memo_default=?,enabled=? where user_id=? and id=?",v.titleDefault(),v.memoDefault(),v.enabled()==null||v.enabled(),owner(),id);return rule(id);}
    private Rule rule(UUID id){return rules().stream().filter(r->r.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Rule not found"));}
    public void deleteRule(UUID id,Long expected){lock();version(rule(id).version(),expected);db.update("delete from money_category_rules where user_id=? and id=?",owner(),id);}
    private void validate(Entry e,UUID id){MoneyTransaction old=id==null?null:money.transaction(id);require(e!=null&&e.type()!=null&&e.occurredAt()!=null,"Type and time required");amount(e.amount());text(e.memo(),2000,false,"Memo");text(e.counterpartyText(),500,false,"Counterparty");
        boolean shape=switch(e.type()){case INCOME,REFUND->e.fromAccountId()==null&&e.toAccountId()!=null;case EXPENSE->e.fromAccountId()!=null&&e.toAccountId()==null;case TRANSFER->e.fromAccountId()!=null&&e.toAccountId()!=null&&!e.fromAccountId().equals(e.toAccountId());default->false;};require(shape,"Account selection does not match type");
        for(UUID a:Arrays.asList(e.fromAccountId(),e.toAccountId()))if(a!=null&&(old==null||!(a.equals(old.fromAccountId())||a.equals(old.toAccountId()))))require(!money.account(a).archived(),"Account is archived");
        if(e.categoryId()!=null)require((!category(e.categoryId()).effectiveArchived()||old!=null&&Objects.equals(old.categoryId(),e.categoryId()))&&(e.type()==TransactionType.INCOME||e.type()==TransactionType.EXPENSE||e.type()==TransactionType.REFUND),"Category applies to income or consumption only");
        require(e.refundOf()==null||e.type()==TransactionType.REFUND,"Only refunds can link an expense");
        if(e.refundOf()!=null){var original=money.transaction(e.refundOf());require(original.type()==TransactionType.EXPENSE&&!original.excluded()&&!Objects.equals(original.id(),id),"Link an included expense");require(!e.occurredAt().isBefore(original.occurredAt()),"Refund must follow expense");
            BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and excluded=false and id<>?",BigDecimal.class,owner(),original.id(),id==null?UUID.randomUUID():id);
            require(e.excluded()||refunded.add(e.amount()).compareTo(original.amount())<=0,"Refund exceeds remaining expense");}
        if(id!=null){BigDecimal refunded=db.queryForObject("select coalesce(sum(amount),0) from money_transactions where user_id=? and refund_of=? and excluded=false",BigDecimal.class,owner(),id);
            require(refunded.signum()==0||(e.type()==TransactionType.EXPENSE&&!e.excluded()&&e.amount().compareTo(refunded)>=0),"Resolve linked refunds before changing the expense");}
    }
    private void audit(MoneyTransaction old,String action){db.update("insert into money_corrections(id,user_id,transaction_id,action,previous_value) values(?,?,?,?,cast(? as jsonb))",UUID.randomUUID(),owner(),old.id(),action,json.writeValueAsString(old));}
    public MoneyTransaction save(UUID id,Entry e){lock();require(e!=null,"Transaction required");MoneyTransaction old=id==null?null:money.transaction(id);if(old!=null){version(old.version(),e.expectedVersion());require(!Set.of(TransactionType.INITIAL_BALANCE,TransactionType.BALANCE_ADJUSTMENT,TransactionType.LOAN_PAYMENT).contains(old.type()),"Use the dedicated financial correction operation");require(old.mergedInto()==null,"Edit the linked transfer instead");require("KRW".equals(old.currency()),"V1 edits support KRW only");}validate(e,id);
        text(e.title(),240,false,"Title");
        UUID category=e.categoryId();if(e.refundOf()!=null)category=money.transaction(e.refundOf()).categoryId();
        if(id==null){id=UUID.randomUUID();db.update("insert into money_transactions(id,user_id,type,from_account_id,to_account_id,amount,currency,occurred_at,counterparty_text,category_id,memo,excluded,manual,refund_of) values(?,?,?,?,?,?,'KRW',?,?,?,?,?,true,?)",id,owner(),e.type().name(),e.fromAccountId(),e.toAccountId(),e.amount(),Timestamp.from(e.occurredAt()),e.counterpartyText(),category,e.memo(),e.excluded(),e.refundOf());money.applyCategoryRule(id);}
        else{audit(old,"EDIT");db.update("update money_transactions set type=?,from_account_id=?,to_account_id=?,amount=?,occurred_at=?,counterparty_text=?,category_id=?,memo=?,excluded=?,refund_of=?,version=version+1 where user_id=? and id=?",e.type().name(),e.fromAccountId(),e.toAccountId(),e.amount(),Timestamp.from(e.occurredAt()),e.counterpartyText(),category,e.memo(),e.excluded(),e.refundOf(),owner(),id);}
        String title=e.title()==null||e.title().isBlank()?null:e.title().strip();
        db.update("update money_transactions set title=case when ? then coalesce(?,title) else ? end where user_id=? and id=?",old==null,title,title,owner(),id);
        if(e.type()==TransactionType.EXPENSE) {
            var refunds=db.queryForList("select id from money_transactions where user_id=? and refund_of=? and category_id is distinct from ?",UUID.class,owner(),id,category);
            for(UUID refund:refunds){audit(money.transaction(refund),"REFUND_CATEGORY_SYNC");db.update("update money_transactions set category_id=?,version=version+1 where user_id=? and id=?",category,owner(),refund);}
        }
        if(old==null)money.applyMeaningRules(id);
        return money.transaction(id);
    }
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset){return transactions(from,to,accountId,categoryId,type,search,includeExcluded,limit,offset,false);}
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset,boolean uncategorized){return transactions(from,to,accountId,categoryId,type,search,includeExcluded,limit,offset,uncategorized,null,null,null,null);}
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset,boolean uncategorized,String accountIds,String categoryIds,String types,String flowRelation){return transactions(from,to,accountId,categoryId,type,search,includeExcluded,limit,offset,uncategorized,accountIds,categoryIds,types,flowRelation,null,null);}
    @Transactional(readOnly=true) public Page transactions(String from,String to,UUID accountId,UUID categoryId,TransactionType type,String search,boolean includeExcluded,int limit,int offset,boolean uncategorized,String accountIds,String categoryIds,String types,String flowRelation,BigDecimal minAmount,BigDecimal maxAmount){page(limit,offset);MoneyWebRevisionService.amountRange(minAmount,maxAmount);List<Object> args=new ArrayList<>();args.add(owner());StringBuilder sql=new StringBuilder(" from money_transactions t where t.user_id=?");
        if(!includeExcluded)sql.append(" and t.excluded=false");if(uncategorized)sql.append(" and t.type='EXPENSE' and t.category_id is null");
        if(from!=null&&!from.isBlank()){sql.append(" and occurred_at>=?");args.add(Timestamp.from(LocalDate.parse(from).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));}
        if(to!=null&&!to.isBlank()){sql.append(" and occurred_at<?");args.add(Timestamp.from(LocalDate.parse(to).plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()));}
        if(accountId!=null){money.account(accountId);sql.append(" and (from_account_id=? or to_account_id=?)");args.add(accountId);args.add(accountId);}
        if(categoryId!=null){category(categoryId);sql.append(" and category_id=?");args.add(categoryId);}
        if(type!=null){sql.append(" and type=?");args.add(type.name());}
        if(search!=null&&!search.isBlank()){text(search,200,false,"Search");sql.append(" and (position(lower(?) in lower(coalesce(title,'')||' '||coalesce(counterparty_text,'')||' '||coalesce(memo,'')))>0)");args.add(search);}
        multiFilter(sql,args,accountIds,"account");multiFilter(sql,args,categoryIds,"category");multiFilter(sql,args,types,"type");
        if(flowRelation!=null){require(MoneyAnalysis.RELATIONS.contains(flowRelation)&&from!=null&&to!=null,"Flow and period required");sql.append(" and t.id in ("+MoneyAnalysis.FACTS+" select id from relations where relation=?)");Collections.addAll(args,owner(),owner(),Timestamp.from(LocalDate.parse(from).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()),Timestamp.from(LocalDate.parse(to).plusDays(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()),flowRelation);}
        if(minAmount!=null){sql.append(" and t.amount>=?");args.add(minAmount);}if(maxAmount!=null){sql.append(" and t.amount<=?");args.add(maxAmount);}
        long total=db.queryForObject("select count(*)"+sql,Long.class,args.toArray());args.add(limit);args.add(offset);
        // Count provenance only for this page; RAW bodies and source details stay on the detail endpoint.
        var pageRows=db.query("with paged as (select t.*"+sql+" order by occurred_at desc,id limit ? offset ?), source_counts as (select s.transaction_id,count(*)::integer source_count from money_transaction_sources s join paged p on p.user_id=s.user_id and p.id=s.transaction_id group by s.transaction_id) select p.*,coalesce(sc.source_count,0) as source_count from paged p left join source_counts sc on sc.transaction_id=p.id order by p.occurred_at desc,p.id",(r,n)->{
            var t=money.transactionListRow(r,n);return new MoneyTransaction(t.id(),t.type(),t.fromAccountId(),t.toAccountId(),t.amount(),t.currency(),t.occurredAt(),t.counterpartyText(),t.sources(),t.categoryId(),t.memo(),t.excluded(),t.version(),t.manual(),t.refundOf(),t.mergedInto(),t.title(),r.getInt("source_count"));
        },args.toArray());
        return new Page(pageRows,total);
    }
    private void multiFilter(StringBuilder sql,List<Object> args,String csv,String kind){
        if(csv==null)return;if(csv.isBlank()||csv.equals("none")){sql.append(" and false");return;}
        var values=new ArrayList<>(new LinkedHashSet<>(Arrays.asList(csv.split(","))));require(values.size()<=200,"Too many filter values");
        if(kind.equals("category")){
          var clauses=new ArrayList<String>();
          for(String value:values){
            if(value.equals("uncategorized")){clauses.add("category_id is null");continue;}
            boolean direct=value.startsWith("direct:");UUID key;try{key=UUID.fromString(direct?value.substring(7):value);}catch(IllegalArgumentException e){throw new InvalidRequestException("Invalid category filter");}
            if(direct){clauses.add("category_id=?");args.add(key);}else{clauses.add("category_id in (select id from money_categories where user_id=? and (id=? or parent_id=?))");Collections.addAll(args,owner(),key,key);}
          }
          sql.append(" and ("+String.join(" or ",clauses)+")");return;
        }
        boolean uncategorized=kind.equals("category")&&values.remove("uncategorized");
        var parsed=new ArrayList<Object>();for(String value:values)try{parsed.add(kind.equals("type")?TransactionType.valueOf(value).name():UUID.fromString(value));}catch(IllegalArgumentException e){throw new InvalidRequestException("Invalid filter value");}
        var slots=String.join(",",Collections.nCopies(parsed.size(),"?"));
        if(kind.equals("account")){sql.append(" and (from_account_id in ("+slots+") or to_account_id in ("+slots+"))");args.addAll(parsed);args.addAll(parsed);}
        else {sql.append(" and (");if(!parsed.isEmpty()){sql.append((kind.equals("type")?"type":"category_id")+" in ("+slots+")");args.addAll(parsed);if(uncategorized)sql.append(" or ");}if(uncategorized)sql.append("category_id is null");sql.append(")");}
    }
    private Instant[] month(String value){try{var m=YearMonth.parse(value);return new Instant[]{m.atDay(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(),m.plusMonths(1).atDay(1).atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant()};}catch(RuntimeException e){throw new InvalidRequestException("Use YYYY-MM");}}
    private List<MoneyTransaction> monthRows(String month){var dates=month(month);return db.query("select * from money_transactions where user_id=? and excluded=false and occurred_at>=? and occurred_at<? order by occurred_at,id",money::transactionListRow,owner(),Timestamp.from(dates[0]),Timestamp.from(dates[1]));}
    /** When one account's balance change became observable: that account's own bank notification when present,
     *  otherwise the ledger time. Minute-precision provider times can otherwise order two same-minute events wrongly
     *  against a notification balance anchor. {@code account} is the SQL expression of the account being balanced. */
    static String effectiveAt(String account){return "coalesce((select min(r.posted_at) from money_transaction_sources s join money_raw_notifications r on r.user_id=s.user_id and r.id=s.raw_event_id"
        +" left join money_parse_attempts pa on pa.user_id=s.user_id and pa.id=s.parse_attempt_id where s.user_id=t.user_id and s.transaction_id=t.id and s.relationship='PRIMARY'"
        +" and (pa.direction is null or pa.direction=case when t.to_account_id="+account+" then 'IN' else 'OUT' end)),t.occurred_at)";}
    /** Signed ledger movement for one account over (after, until] on the shared effective-time basis. Opening/reconciliation facts are anchors, never deltas. */
    BigDecimal ledgerDelta(UUID account,Instant after,Instant until){
        return db.queryForObject("select coalesce(sum(case when t.to_account_id=? then t.amount else -t.amount end),0) from money_transactions t where t.user_id=? and not t.excluded and t.merged_into is null"
            +" and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') and (t.from_account_id=? or t.to_account_id=?) and "+effectiveAt("?::uuid")+">? and "+effectiveAt("?::uuid")+"<=?",
            BigDecimal.class,account,owner(),account,account,account,Timestamp.from(after),account,Timestamp.from(until));
    }
    /** Every bank-reported post-transaction balance attached to an included ledger fact, resolved to its account. */
    List<Map<String,Object>> notificationObservations(){
        var identities=money.accounts();var result=new ArrayList<Map<String,Object>>();
        db.query("""
            select p.candidate::text candidate,t.from_account_id,t.to_account_id from money_parse_attempts p
            join money_transaction_sources s on s.parse_attempt_id=p.id and s.user_id=p.user_id
            join money_transactions t on t.id=s.transaction_id and t.user_id=s.user_id
            where p.user_id=? and t.excluded=false and t.merged_into is null and p.candidate->>'postBalance' is not null
            """,r->{var c=json.readValue(r.getString("candidate"),ParsedCandidate.class);if(c.postedAt()==null||c.postBalance()==null)return;
                var resolved=new MoneyAccountResolver().resolve(identities,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());
                if(!resolved.resolved())return;var id=resolved.account().id();
                if(!id.equals(r.getObject("from_account_id",UUID.class))&&!id.equals(r.getObject("to_account_id",UUID.class)))return;
                result.add(Map.of("accountId",id,"at",c.postedAt(),"amount",c.postBalance(),"kind","NOTIFICATION"));},owner());
        return result;
    }
    static boolean savings(AccountRole role){return role==AccountRole.SAVINGS||role==AccountRole.PURPOSE_SAVINGS||role==AccountRole.PURPOSE_INSTALLMENT;}
    @Transactional(readOnly=true) public Map<String,Object> dashboard(String month){var rows=monthRows(month);var accounts=money.accounts();Map<UUID,MoneyAccount> byId=new HashMap<>();accounts.forEach(a->byId.put(a.id(),a));BigDecimal income=BigDecimal.ZERO,consumption=BigDecimal.ZERO,savings=BigDecimal.ZERO;Map<String,BigDecimal> amounts=new LinkedHashMap<>();
        for(var t:rows){if(t.type()==TransactionType.INCOME)income=income.add(t.amount());if(t.type()==TransactionType.EXPENSE||t.type()==TransactionType.REFUND){BigDecimal delta=t.type()==TransactionType.REFUND?t.amount().negate():t.amount();consumption=consumption.add(delta);UUID cat=t.refundOf()!=null?money.transaction(t.refundOf()).categoryId():t.categoryId();amounts.merge(cat==null?"uncategorized":cat.toString(),delta,BigDecimal::add);}
            if(t.type()==TransactionType.TRANSFER){boolean src=savings(byId.get(t.fromAccountId()).role()),dst=savings(byId.get(t.toAccountId()).role());if(src!=dst)savings=savings.add(dst?t.amount():t.amount().negate());}}
        return Map.of("month",month,"income",income,"consumption",consumption,"savingsMovement",savings,"categories",amounts,"reviewCount",reviewCount(),"flow",flow(rows));
    }
    private List<Map<String,Object>> flow(List<MoneyTransaction> rows){Map<String,Map<String,Object>> grouped=new LinkedHashMap<>();for(var t:rows)if(t.type()==TransactionType.TRANSFER){String key=t.fromAccountId()+":"+t.toAccountId();var row=grouped.computeIfAbsent(key,k->new LinkedHashMap<>(Map.of("fromAccountId",t.fromAccountId(),"toAccountId",t.toAccountId(),"amount",BigDecimal.ZERO)));row.put("amount",((BigDecimal)row.get("amount")).add(t.amount()));}return new ArrayList<>(grouped.values());}
    @Transactional(readOnly=true) public Balance balance(UUID id){return accountBalances(Instant.now(),id).stream().filter(row->((MoneyAccount)row.get("account")).id().equals(id)).map(row->(Balance)row.get("balance")).findFirst().orElseThrow(()->new ResourceNotFoundException("Account not found"));}
    public Balance checkpoint(UUID id,Checkpoint v){lock();var a=money.account(id);require(v!=null&&v.amount()!=null&&v.amount().abs().compareTo(new BigDecimal("100000000000000000"))<0&&v.amount().stripTrailingZeros().scale()<=2,"Invalid balance");version(a.version(),v.expectedVersion());require(v.verifiedAt()!=null&&!v.verifiedAt().isAfter(Instant.now().plusSeconds(60)),"Verification time cannot be in the future");text(v.note(),500,false,"Note");db.update("insert into money_balance_checkpoints(id,user_id,account_id,amount,verified_at,note) values(?,?,?,?,?,?)",UUID.randomUUID(),owner(),id,v.amount(),Timestamp.from(v.verifiedAt()),v.note());db.update("update money_accounts set version=version+1,updated_at=now() where user_id=? and id=?",owner(),id);return balance(id);}
    @Transactional(readOnly=true) public AccountView accountDetail(UUID id,String month){var a=money.account(id);BigDecimal in=BigDecimal.ZERO,out=BigDecimal.ZERO;var dates=month(month);var txs=db.query("select * from money_transactions where user_id=? and excluded=false and merged_into is null and (from_account_id=? or to_account_id=?) and occurred_at>=? and occurred_at<? order by occurred_at,id",money::transactionListRow,owner(),id,id,Timestamp.from(dates[0]),Timestamp.from(dates[1]));for(var t:txs){if(t.type()==TransactionType.INITIAL_BALANCE||t.type()==TransactionType.BALANCE_ADJUSTMENT)continue;if(id.equals(t.toAccountId()))in=in.add(t.amount());if(id.equals(t.fromAccountId()))out=out.add(t.amount());}
        var cps=db.queryForList("select id,amount,verified_at as \"verifiedAt\",note,created_at as \"createdAt\" from money_balance_checkpoints where user_id=? and account_id=? order by verified_at desc,created_at desc",owner(),id);
        return new AccountView(a,balance(id),in,out,flow(txs).stream().filter(f->id.equals(f.get("fromAccountId"))||id.equals(f.get("toAccountId"))).toList(),cps,txs.reversed().stream().limit(50).toList(),txs.size());}
    @Transactional(readOnly=true) public List<Map<String,Object>> accountBalances(){return accountBalances(Instant.now());}
    @Transactional(readOnly=true) public List<Map<String,Object>> accountBalances(Instant cutoff){return accountBalances(cutoff,null);}
    @Transactional(readOnly=true) public List<Map<String,Object>> accountBalances(Instant cutoff,UUID accountId){return accountBalances(cutoff,accountId,null);}
    List<Map<String,Object>> accountBalances(Instant cutoff,UUID accountId,UUID excludedTransaction){
        var identities=money.accounts();var accounts=accountId==null?identities:identities.stream().filter(a->a.id().equals(accountId)).toList();if(accounts.isEmpty())return List.of();
        Map<UUID,Balance> bases=new HashMap<>();accounts.forEach(a->bases.put(a.id(),new Balance(BigDecimal.ZERO,"CALCULATED",null)));
        db.query("select distinct on(account_id) account_id,amount,verified_at from money_balance_checkpoints where user_id=? and verified_at<=? and (?::uuid is null or account_id=?) order by account_id,verified_at desc,created_at desc,id desc",r->{
            bases.put(r.getObject("account_id",UUID.class),new Balance(r.getBigDecimal("amount"),"MANUALLY_VERIFIED",r.getTimestamp("verified_at").toInstant()));
        },owner(),Timestamp.from(cutoff),accountId,accountId);
        var candidates=db.queryForList("""
            select distinct on(p.provider,p.candidate->>'direction',p.candidate->>'sourceAccountHint',p.candidate->>'destinationAccountHint') p.candidate::text,t.from_account_id,t.to_account_id
            from money_parse_attempts p join money_transaction_sources s on s.parse_attempt_id=p.id and s.user_id=p.user_id
            join money_transactions t on t.id=s.transaction_id and t.user_id=s.user_id
            where p.user_id=? and (?::uuid is null or t.from_account_id=? or t.to_account_id=?) and t.excluded=false and t.merged_into is null and (?::uuid is null or t.id<>?) and p.candidate->>'postBalance' is not null and (p.candidate->>'postedAt')::timestamptz<=?
            order by p.provider,p.candidate->>'direction',p.candidate->>'sourceAccountHint',p.candidate->>'destinationAccountHint', (p.candidate->>'postedAt')::timestamptz desc nulls last
            """,owner(),accountId,accountId,accountId,excludedTransaction,excludedTransaction,Timestamp.from(cutoff));
        for(var value:candidates){var c=json.readValue((String)value.get("candidate"),ParsedCandidate.class);var resolved=new MoneyAccountResolver().resolve(identities,c.provider(),c.direction()==Direction.OUT?c.sourceAccountHint():c.destinationAccountHint());
            if(resolved.resolved()&&c.postedAt()!=null){var id=resolved.account().id();if(!id.equals(value.get("from_account_id"))&&!id.equals(value.get("to_account_id")))continue;var old=bases.get(id);if(old==null)continue;if(old.asOf()==null||c.postedAt().isAfter(old.asOf()))bases.put(id,new Balance(c.postBalance(),"NOTIFICATION",c.postedAt()));}}
        var args=new ArrayList<Object>();var values=new ArrayList<String>();
        for(var a:accounts){values.add("(?::uuid,?::timestamptz)");args.add(a.id());args.add(Timestamp.from(Optional.ofNullable(bases.get(a.id()).asOf()).orElse(Instant.EPOCH)));}args.add(owner());args.add(excludedTransaction);args.add(excludedTransaction);args.add(Timestamp.from(cutoff));
        Map<UUID,BigDecimal> deltas=new HashMap<>();
        db.query("with baseline(id,at) as(values "+String.join(",",values)+") select b.id,coalesce(sum(case when t.to_account_id=b.id then t.amount else -t.amount end),0) delta from baseline b left join money_transactions t on t.user_id=? and t.excluded=false and (?::uuid is null or t.id<>?) and t.type not in ('INITIAL_BALANCE','BALANCE_ADJUSTMENT') and (t.from_account_id=b.id or t.to_account_id=b.id) and t.merged_into is null and "+effectiveAt("b.id")+">b.at and "+effectiveAt("b.id")+"<=? group by b.id",r->{deltas.put(r.getObject("id",UUID.class),r.getBigDecimal("delta"));},args.toArray());
        return accounts.stream().map(a->{var b=bases.get(a.id());var d=deltas.get(a.id());return Map.<String,Object>of("account",a,"balance",new Balance(b.amount().add(d),d.signum()==0?b.provenance():"CALCULATED_FROM_"+b.provenance(),b.asOf()));}).toList();
    }
    public record Reconciliation(UUID accountId,boolean archived,String status,BigDecimal observedBalance,Instant observedAt,String observedSource,
        BigDecimal ledgerBalance,BigDecimal difference,String basis,Instant basisAt,BigDecimal basisAmount,Balance current,boolean hasInitialBalance){}
    /**
     * Ledger vs real balance. The latest bank/owner-verified balance is compared with the balance the ledger alone
     * calculates from the previous trusted anchor (latest owner-verified checkpoint, else the first bank-reported
     * balance). Nothing is written; a difference stays visible until explained or explicitly reconciled.
     */
    @Transactional(readOnly=true) public List<Reconciliation> reconciliation(){
        var accounts=money.accounts();Map<UUID,Balance> current=new HashMap<>();
        accountBalances().forEach(r->current.put(((MoneyAccount)r.get("account")).id(),(Balance)r.get("balance")));
        Map<UUID,List<Map<String,Object>>> observations=new HashMap<>();
        db.query("select account_id,amount,verified_at from money_balance_checkpoints where user_id=? order by verified_at,created_at,id",r->{
            observations.computeIfAbsent(r.getObject("account_id",UUID.class),k->new ArrayList<>()).add(Map.of("at",r.getTimestamp("verified_at").toInstant(),"amount",r.getBigDecimal("amount"),"kind","MANUAL"));},owner());
        for(var o:notificationObservations())observations.computeIfAbsent((UUID)o.get("accountId"),k->new ArrayList<>()).add(o);
        var initial=new HashSet<>(db.queryForList("select to_account_id from money_transactions where user_id=? and type='INITIAL_BALANCE'",UUID.class,owner()));
        // Ties: an owner-verified checkpoint at the same instant is the later, authoritative statement.
        Comparator<Map<String,Object>> order=Comparator.comparing((Map<String,Object> o)->(Instant)o.get("at")).thenComparing(o->"MANUAL".equals(o.get("kind"))?1:0);
        var result=new ArrayList<Reconciliation>();
        for(var a:accounts){
            var list=observations.getOrDefault(a.id(),List.of()).stream().sorted(order).toList();var now=current.get(a.id());boolean opening=initial.contains(a.id());
            if(list.isEmpty()){result.add(new Reconciliation(a.id(),a.archived(),"NO_OBSERVATION",null,null,null,now.amount(),null,null,null,null,now,opening));continue;}
            var latest=list.getLast();Instant at=(Instant)latest.get("at");BigDecimal observed=(BigDecimal)latest.get("amount");
            if("MANUAL".equals(latest.get("kind"))){result.add(new Reconciliation(a.id(),a.archived(),"ANCHORED",observed,at,"MANUAL",observed,BigDecimal.ZERO,"MANUAL",at,observed,now,opening));continue;}
            var anchor=list.stream().filter(o->"MANUAL".equals(o.get("kind"))&&((Instant)o.get("at")).isBefore(at)).reduce((x,y)->y)
                .or(()->list.stream().filter(o->((Instant)o.get("at")).isBefore(at)).findFirst());
            if(anchor.isEmpty()){result.add(new Reconciliation(a.id(),a.archived(),"UNVERIFIABLE",observed,at,"NOTIFICATION",null,null,null,null,null,now,opening));continue;}
            Instant from=(Instant)anchor.get().get("at");BigDecimal base=(BigDecimal)anchor.get().get("amount");
            BigDecimal ledger=base.add(ledgerDelta(a.id(),from,at));BigDecimal diff=observed.subtract(ledger);
            result.add(new Reconciliation(a.id(),a.archived(),diff.signum()==0?"MATCHED":"MISMATCH",observed,at,"NOTIFICATION",ledger,diff,
                "MANUAL".equals(anchor.get().get("kind"))?"MANUAL":"FIRST_NOTIFICATION",from,base,now,opening));
        }
        return result;
    }
    @Transactional(readOnly=true) public List<Map<String,Object>> balanceIssues(){
        return reconciliation().stream().filter(r->!r.archived()&&"MISMATCH".equals(r.status())).map(r->Map.<String,Object>of("accountId",r.accountId(),
            "expectedBalance",r.ledgerBalance(),"observedBalance",r.observedBalance(),"difference",r.difference(),"observedAt",r.observedAt())).toList();
    }
    private long reviewCount(){return db.queryForObject(MoneyReviewService.DECISION_COUNT,Long.class,owner());}
    @Transactional(readOnly=true) public Map<String,Object> review(int limit,int offset){page(limit,offset);var raws=db.query("select * from money_raw_notifications where user_id=? and state in ('REVIEW_REQUIRED','FAILED') order by received_at,id limit ? offset ?",money::rawRow,owner(),limit,offset);
        var txs=db.query("select * from money_transactions where user_id=? and excluded=false and type='EXPENSE' and category_id is null order by occurred_at desc,id limit ? offset ?",money::transactionListRow,owner(),limit,offset);
        var issues=balanceIssues();long count=db.queryForObject("select (select count(*) from money_raw_notifications where user_id=? and state in ('REVIEW_REQUIRED','FAILED'))+(select count(*) from money_transactions where user_id=? and excluded=false and type='EXPENSE' and category_id is null)",Long.class,owner(),owner());
        return Map.of("raw",raws,"uncategorized",txs,"total",count+issues.size(),"balanceIssues",issues,"deferredIds",db.queryForList("select id from money_raw_notifications where user_id=? and review_deferred and state in ('REVIEW_REQUIRED','FAILED')",UUID.class,owner()));}
    public MoneyTransaction reviewPost(ReviewPost v){lock();require(v!=null&&v.rawIds()!=null&&!v.rawIds().isEmpty()&&v.rawIds().size()<=2&&new HashSet<>(v.rawIds()).size()==v.rawIds().size()&&v.expectedVersions()!=null&&v.expectedVersions().size()==v.rawIds().size(),"Select one or two sources");
        for(int i=0;i<v.rawIds().size();i++){var raw=money.notification(v.rawIds().get(i));version(raw.processingVersion(),v.expectedVersions().get(i));require(raw.state()==ProcessingState.REVIEW_REQUIRED||raw.state()==ProcessingState.FAILED,"Only unresolved sources may be reviewed");}
        if(v.rawIds().size()==2)pairedSources(v);var tx=save(null,v.transaction());for(UUID raw:v.rawIds()){// Keep the confirmed observation's parse attempt so its bank-reported balance remains reconciliation evidence.
            db.update("insert into money_transaction_sources(transaction_id,user_id,raw_event_id,parse_attempt_id,relationship,evidence) values(?,?,?,(select id from money_parse_attempts where user_id=? and raw_event_id=? order by created_at desc,id desc limit 1),'PRIMARY','{\"rule\":\"USER_CONFIRMED\"}')",tx.id(),owner(),raw,owner(),raw);money.finishProcessing(raw,ProcessingState.PROCESSED,"USER_CONFIRMED");}db.update("update money_transactions set manual=false where user_id=? and id=?",owner(),tx.id());return money.transaction(tx.id());}
    /** Two raw sources with opposite directions can only be one owned-account transfer of the same amount. */
    private void pairedSources(ReviewPost v){
        var attempts=v.rawIds().stream().map(id->db.query("select direction,amount from money_parse_attempts where user_id=? and raw_event_id=? order by created_at desc,id desc limit 1",(r,n)->new Object[]{r.getString("direction"),r.getBigDecimal("amount")},owner(),id)).toList();
        if(attempts.stream().anyMatch(List::isEmpty))return;var a=attempts.get(0).getFirst();var b=attempts.get(1).getFirst();
        if(a[0]==null||b[0]==null||a[0].equals(b[0]))return;
        var e=v.transaction();require(e!=null&&e.type()==TransactionType.TRANSFER,"입금·출금 알림 한 쌍은 내 계좌 간 이체로만 확정할 수 있습니다.");
        require(a[1]!=null&&b[1]!=null&&((BigDecimal)a[1]).compareTo((BigDecimal)b[1])==0&&e.amount()!=null&&e.amount().compareTo((BigDecimal)a[1])==0,"두 알림과 이체 금액이 같아야 합니다.");
    }
    MoneyTransaction transactionFact(UUID id){return money.transaction(id);}
    /** Owner decision that a raw notification is not a financial transaction. Raw evidence is preserved. */
    void ignoreNotification(UUID id,Long expected){var raw=money.notification(id);version(raw.processingVersion(),expected);require(raw.state()==ProcessingState.REVIEW_REQUIRED||raw.state()==ProcessingState.FAILED,"Only unresolved notifications can be ignored");money.finishProcessing(id,ProcessingState.PROCESSED,"USER_IGNORED_NON_FINANCIAL");}
    /** Return an ignored/excluded notification to Review. Posted evidence can never be restored this way. */
    public void restoreNotification(UUID id,Long expected){lock();var raw=money.notification(id);version(raw.processingVersion(),expected);
        require(raw.state()==ProcessingState.PROCESSED&&Set.of("IGNORED_NON_FINANCIAL","USER_EXCLUDED","USER_IGNORED_NON_FINANCIAL").contains(raw.processingReason())
            &&db.queryForObject("select count(*) from money_transaction_sources where user_id=? and raw_event_id=?",Integer.class,owner(),id)==0,"Only ignored notifications without ledger links can be restored");
        money.finishProcessing(id,ProcessingState.REVIEW_REQUIRED,"RESTORED_BY_OWNER");}
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
