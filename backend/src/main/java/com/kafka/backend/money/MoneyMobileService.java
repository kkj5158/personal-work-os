package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.kafka.backend.money.MoneyTypes.*;
import static com.kafka.backend.money.MoneyService.require;

/**
 * MONEY Mobile fund composition (Drive 105 §5, §13-16, §23) and the net-saving trend (§8.4).
 * Fund group, bookkeeping tracking and structural role are independent axes: nothing here
 * changes tracking or role. Balances and savings movement reuse the shared Web calculations.
 */
@Service
@Transactional
public class MoneyMobileService {
    public static final Set<String> GROUPS=Set.of("LIVING","SAVINGS","OTHER");
    public static final Set<String> SUBTYPES=Set.of("SAVINGS_ACCOUNT","INSTALLMENT");
    public record Fund(String fundGroup,String savingsSubtype,int fundOrder) {}
    public record FundAccount(MoneyAccount account,Fund fund,MoneyProductService.Balance balance) {}
    public record GroupTotal(BigDecimal amount,int count,Instant asOf) {}
    public record LoanTotal(BigDecimal amount,int count,LocalDate nextDueDate,BigDecimal scheduledPayment) {}
    public record Settings(boolean showLoansOnHome,long version) {}
    public record Funds(List<FundAccount> accounts,Map<String,GroupTotal> groups,LoanTotal loans,Settings settings,Instant basis) {}
    public record FundInput(String fundGroup,String savingsSubtype,Long expectedVersion) {}
    public record OrderInput(String fundGroup,List<UUID> ids) {}
    public record SettingsInput(Boolean showLoansOnHome,Long expectedVersion) {}
    public record CreateInput(AccountInput account,String fundGroup,String savingsSubtype) {}
    public record SavingsBucket(String period,LocalDate start,LocalDate end,BigDecimal inflow,BigDecimal outflow,BigDecimal net,long count) {}
    public record SavingsTrend(String from,String to,String unit,BigDecimal inflow,BigDecimal outflow,BigDecimal net,List<SavingsBucket> buckets) {}

    private static final ZoneId SEOUL=ZoneId.of("Asia/Seoul");
    private final JdbcTemplate db;private final CurrentUserProvider users;private final MoneyService money;private final MoneyProductService product;
    public MoneyMobileService(JdbcTemplate db,CurrentUserProvider users,MoneyService money,MoneyProductService product){
        this.db=db;this.users=users;this.money=money;this.product=product;
    }
    private UUID owner(){return users.getCurrentUserId();}
    private void lock(){db.queryForObject("select pg_advisory_xact_lock(hashtextextended(?,0))",Object.class,"money:"+owner());}
    private static void version(long actual,Long expected){
        if(expected==null||actual!=expected)throw new OptimisticLockConflictException("기록이 변경되었습니다. 다시 불러온 뒤 저장하세요.");
    }

    @Transactional(readOnly=true) public Map<UUID,Fund> funds(){
        var result=new HashMap<UUID,Fund>();
        db.query("select id,fund_group,savings_subtype,fund_order from money_accounts where user_id=?",r->{
            result.put(r.getObject("id",UUID.class),new Fund(r.getString("fund_group"),r.getString("savings_subtype"),r.getInt("fund_order")));
        },owner());
        return result;
    }

    @Transactional(readOnly=true) public Funds overview(){
        var funds=funds();
        var accounts=new ArrayList<FundAccount>();
        for(var row:product.accountBalances()){
            var account=(MoneyAccount)row.get("account");
            accounts.add(new FundAccount(account,funds.get(account.id()),(MoneyProductService.Balance)row.get("balance")));
        }
        accounts.sort(Comparator.comparing((FundAccount a)->a.fund().fundOrder()).thenComparing(a->a.account().displayName()));
        var groups=new LinkedHashMap<String,GroupTotal>();
        for(String group:List.of("LIVING","SAVINGS","OTHER")){
            // Only active accounts included in assets form fund totals; one group per account prevents double counting.
            var members=accounts.stream().filter(a->!a.account().archived()&&a.account().includeInAssets()&&a.fund().fundGroup().equals(group)).toList();
            BigDecimal total=members.stream().map(a->a.balance().amount()).reduce(BigDecimal.ZERO,BigDecimal::add);
            Instant asOf=members.stream().map(a->a.balance().asOf()).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null);
            groups.put(group,new GroupTotal(total,members.size(),asOf));
        }
        var loan=db.queryForMap("""
            select coalesce(sum(remaining_principal),0) amount,count(*) count,min(next_due_date) next_due,
              sum(monthly_payment) filter(where monthly_payment is not null) scheduled
            from money_loans where user_id=? and status='ACTIVE' and not deleted""",owner());
        var loans=new LoanTotal((BigDecimal)loan.get("amount"),((Number)loan.get("count")).intValue(),
            loan.get("next_due")==null?null:((java.sql.Date)loan.get("next_due")).toLocalDate(),(BigDecimal)loan.get("scheduled"));
        return new Funds(accounts,groups,loans,settings(),Instant.now());
    }

    @Transactional(readOnly=true) public Settings settings(){
        var rows=db.queryForList("select show_loans_on_home,version from money_mobile_settings where user_id=?",owner());
        if(rows.isEmpty())return new Settings(true,0);
        return new Settings((Boolean)rows.getFirst().get("show_loans_on_home"),((Number)rows.getFirst().get("version")).longValue());
    }

    public Settings saveSettings(SettingsInput input){
        lock();
        require(input!=null&&input.showLoansOnHome()!=null,"Home loan display choice required");
        var current=settings();
        version(current.version(),input.expectedVersion());
        db.update("""
            insert into money_mobile_settings(user_id,show_loans_on_home,version,updated_at) values(?,?,1,now())
            on conflict(user_id) do update set show_loans_on_home=excluded.show_loans_on_home,
              version=money_mobile_settings.version+1,updated_at=now()""",owner(),input.showLoansOnHome());
        return settings();
    }

    private static String normalizedSubtype(String group,String subtype){
        require(group!=null&&GROUPS.contains(group),"자금 구분은 생활비 / 저축·적금 / 기타 중 하나여야 합니다.");
        if(!group.equals("SAVINGS"))return null;
        // The owner confirms the subtype; it is never inferred from a product name.
        require(subtype!=null&&SUBTYPES.contains(subtype),"저축통장 / 적금통장 구분을 선택하세요.");
        return subtype;
    }

    public FundAccount saveFund(UUID id,FundInput input){
        lock();
        require(input!=null,"Fund group required");
        var account=money.account(id);
        require(!account.archived(),"보관된 계좌는 자금 구성을 바꿀 수 없습니다.");
        version(account.version(),input.expectedVersion());
        String subtype=normalizedSubtype(input.fundGroup(),input.savingsSubtype());
        var old=funds().get(id);
        int order=old.fundGroup().equals(input.fundGroup())?old.fundOrder():nextOrder(input.fundGroup());
        db.update("update money_accounts set fund_group=?,savings_subtype=?,fund_order=?,version=version+1,updated_at=now() where user_id=? and id=?",
            input.fundGroup(),subtype,order,owner(),id);
        return fundAccount(id);
    }

    private int nextOrder(String group){
        Integer max=db.queryForObject("select max(fund_order) from money_accounts where user_id=? and fund_group=?",Integer.class,owner(),group);
        return max==null?0:max+1;
    }

    public List<FundAccount> order(OrderInput input){
        lock();
        require(input!=null&&input.ids()!=null&&!input.ids().isEmpty(),"Order required");
        require(input.fundGroup()!=null&&GROUPS.contains(input.fundGroup()),"Unknown fund group");
        require(new HashSet<>(input.ids()).size()==input.ids().size(),"Duplicate account");
        var members=new HashSet<>(db.queryForList("select id from money_accounts where user_id=? and fund_group=? and not archived",UUID.class,owner(),input.fundGroup()));
        require(members.equals(new HashSet<>(input.ids())),"같은 그룹의 활성 계좌 전체를 한 번씩 보내야 합니다.");
        for(int i=0;i<input.ids().size();i++)
            db.update("update money_accounts set fund_order=? where user_id=? and id=?",i,owner(),input.ids().get(i));
        return input.ids().stream().map(this::fundAccount).toList();
    }

    public FundAccount create(CreateInput input){
        lock();
        require(input!=null&&input.account()!=null,"Account required");
        // Mobile default for a new account is 기타 (105 §15).
        String group=input.fundGroup()==null?"OTHER":input.fundGroup();
        String subtype=normalizedSubtype(group,input.savingsSubtype());
        var account=money.createAccount(input.account());
        db.update("update money_accounts set fund_group=?,savings_subtype=?,fund_order=? where user_id=? and id=?",
            group,subtype,nextOrder(group),owner(),account.id());
        return fundAccount(account.id());
    }

    @Transactional(readOnly=true) public FundAccount fundAccount(UUID id){
        var account=money.account(id);
        var balance=product.accountBalances(Instant.now(),id).stream().findFirst()
            .map(r->(MoneyProductService.Balance)r.get("balance")).orElse(new MoneyProductService.Balance(BigDecimal.ZERO,"CALCULATED",null));
        return new FundAccount(account,funds().get(id),balance);
    }

    /** Net savings = non-savings → savings minus savings → non-savings; internal hops contribute zero. */
    @Transactional(readOnly=true) public SavingsTrend savingsTrend(String from,String to,String unit){
        require("week".equals(unit)||"month".equals(unit),"Aggregation must be week or month");
        LocalDate a=LocalDate.parse(from),b=LocalDate.parse(to);
        require(!a.isAfter(b),"Start must precede end");
        require(!b.isAfter(a.plusYears(2)),"Period is limited to two years");
        Object[] args={owner(),owner(),Timestamp.from(a.atStartOfDay(SEOUL).toInstant()),Timestamp.from(b.plusDays(1).atStartOfDay(SEOUL).toInstant())};
        var sums=new TreeMap<LocalDate,BigDecimal[]>();
        db.query(MoneyAnalysis.FACTS+"""
            select date_trunc('%s',occurred_at at time zone 'Asia/Seoul')::date bucket,
              coalesce(sum(contribution) filter(where contribution>0),0) inflow,
              coalesce(-sum(contribution) filter(where contribution<0),0) outflow,count(*) count
            from relations where relation='SAVINGS' group by 1""".formatted(unit),r->{
            sums.put(r.getDate("bucket").toLocalDate(),new BigDecimal[]{r.getBigDecimal("inflow"),r.getBigDecimal("outflow"),BigDecimal.valueOf(r.getLong("count"))});
        },args);
        var buckets=new ArrayList<SavingsBucket>();
        BigDecimal in=BigDecimal.ZERO,out=BigDecimal.ZERO;
        LocalDate start=unit.equals("week")?a.with(DayOfWeek.MONDAY):a.withDayOfMonth(1);
        while(!start.isAfter(b)){
            LocalDate next=unit.equals("week")?start.plusWeeks(1):start.plusMonths(1);
            var v=sums.getOrDefault(start,new BigDecimal[]{BigDecimal.ZERO,BigDecimal.ZERO,BigDecimal.ZERO});
            // Buckets are clipped to the requested period so drill-down ranges match the totals.
            LocalDate s=start.isBefore(a)?a:start,e=next.minusDays(1).isAfter(b)?b:next.minusDays(1);
            buckets.add(new SavingsBucket(unit.equals("week")?s.toString():start.toString().substring(0,7),s,e,v[0],v[1],v[0].subtract(v[1]),v[2].longValue()));
            in=in.add(v[0]);out=out.add(v[1]);start=next;
        }
        Collections.reverse(buckets); // newest first, matching the Mobile period table
        return new SavingsTrend(from,to,unit,in,out,in.subtract(out),buckets);
    }
}
