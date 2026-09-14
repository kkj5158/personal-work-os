package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.sql.*;
import java.time.LocalDate;
import java.util.*;
import static com.kafka.backend.diet.DietTypes.*;

@Service
@Transactional
public class DietService {
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    private final ObjectMapper json;
    public DietService(JdbcTemplate db, CurrentUserProvider users, ObjectMapper json) {
        this.db=db; this.users=users; this.json=json;
    }
    private UUID owner() { return users.getCurrentUserId(); }
    // Every mutation holds this owner lock, including initial concurrent creation.
    private void lock() {
        db.update("insert into diet_settings(owner_id) values(?) on conflict(owner_id) do nothing",owner());
        db.queryForList("select owner_id from diet_settings where owner_id=? for update",owner());
    }
    private static LocalDate date(ResultSet r,String name)throws SQLException { return r.getDate(name).toLocalDate(); }
    private static Double number(ResultSet r,String name)throws SQLException { return r.getObject(name,Double.class); }
    private static UUID id(ResultSet r,String name)throws SQLException { return r.getObject(name,UUID.class); }
    private static void require(boolean valid,String message) { if(!valid)throw new InvalidRequestException(message); }
    private static void value(Double v,boolean positive) { require(v==null || Double.isFinite(v) && (positive?v>0:v>=0) && v<=1000000,"수치는 유효한 양수 또는 0이어야 합니다."); }
    private static String text(String s,int max,boolean required) { var v=Objects.requireNonNullElse(s,"").trim(); require(v.length()<=max && (!required||!v.isEmpty()),"텍스트 길이 또는 필수 항목을 확인하세요."); return v; }
    private static void same(UUID path,UUID body) { require(body==null||path.equals(body),"요청 ID가 일치하지 않습니다."); }
    private void owned(String table,UUID id) {
        if(id==null || db.queryForObject("select count(*) from "+table+" where owner_id=? and id=?",Integer.class,owner(),id)==0)
            throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");
    }
    // Table/column names are internal constants, never request input.
    private void upsert(String table,UUID id,String columns,Object... values) {
        var names=columns.split(","); var updates=Arrays.stream(names).map(n->n+"=excluded."+n).toList();
        var args=new ArrayList<Object>();args.add(id);args.add(owner());args.addAll(Arrays.asList(values));
        var placeholders=new ArrayList<String>();placeholders.add("?");placeholders.add("?");
        for(String column:names)placeholders.add((column.equals("notes")||column.equals("memo_items"))?"cast(? as jsonb)":"?");
        int changed=db.update("insert into "+table+"(id,owner_id,"+columns+") values("+String.join(",",placeholders)+") on conflict(id) do update set "+String.join(",",updates)+" where "+table+".owner_id=excluded.owner_id",args.toArray());
        if(changed==0)throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");
    }
    @Transactional(readOnly=true)
    public Data data() {
        var days=db.query("select * from diet_days where owner_id=? order by entry_date",(r,n)->new DailyRecord(date(r,"entry_date"),number(r,"morning_weight"),number(r,"target_weight"),number(r,"morning_glucose"),number(r,"morning_breath_ketone"),number(r,"bedtime_glucose"),number(r,"bedtime_breath_ketone"),number(r,"morning_blood_ketone"),number(r,"bedtime_blood_ketone"),number(r,"waist_circumference"),number(r,"fasting_hours")),owner());
        var items=db.query("select * from diet_items where owner_id=? order by sort_order,id",(r,n)->new ChecklistItem(id(r,"id"),r.getString("title"),Importance.valueOf(r.getString("importance")),r.getString("key_point"),r.getInt("sort_order"),r.getObject("weekly_reference",Integer.class),r.getObject("monthly_reference",Integer.class),r.getBoolean("active"),date(r,"start_date")),owner());
        var checks=db.query("select * from diet_checks where owner_id=? order by entry_date,item_id",(r,n)->new DailyCheck(date(r,"entry_date"),id(r,"item_id"),CheckState.valueOf(r.getString("state")),r.getString("memo")),owner());
        var memberships=new HashMap<UUID,List<UUID>>();
        db.query("select * from diet_challenge_items where owner_id=? order by position",r->{memberships.computeIfAbsent(id(r,"challenge_id"),k->new ArrayList<>()).add(id(r,"item_id"));},owner());
        var challenges=db.query("select * from diet_challenges where owner_id=? order by sort_order,id",(r,n)->new Challenge(id(r,"id"),r.getString("title"),ChallengeType.valueOf(r.getString("type")),ChallengeStatus.valueOf(r.getString("status")),date(r,"start_date"),date(r,"end_date"),r.getString("color"),r.getString("key_point"),Arrays.asList(json.readValue(r.getString("notes"),String[].class)),r.getInt("sort_order"),number(r,"start_weight"),number(r,"target_weight"),memberships.getOrDefault(id(r,"id"),List.of()),GoalMode.valueOf(r.getString("goal_mode")),r.getBoolean("include_missing"),number(r,"current_value"),number(r,"target_value"),ChallengeRole.valueOf(r.getString("role")),r.getInt("home_sort_order")),owner());
        var goals=db.query("select * from diet_global_goals where owner_id=? order by target_date,id",(r,n)->new WeightGoal(id(r,"id"),GoalKind.valueOf(r.getString("kind")),date(r,"target_date"),number(r,"target_weight"),r.getString("core"),Arrays.asList(json.readValue(r.getString("memo_items"),String[].class))),owner());
        var milestones=db.query("select * from diet_milestones where owner_id=? order by entry_date,id",(r,n)->new Milestone(id(r,"id"),id(r,"challenge_id"),date(r,"entry_date"),number(r,"value"),r.getString("title"),r.getString("memo"),Arrays.asList(json.readValue(r.getString("memo_items"),String[].class))),owner());
        var settings=db.query("select settings from diet_settings where owner_id=?",(r,n)->readSettings(r.getString(1)),owner());
        return new Data(days,items,checks,challenges,goals,milestones,settings.isEmpty()?Map.of():settings.getFirst());
    }
    @SuppressWarnings("unchecked") private Map<String,Object> readSettings(String s) { return json.readValue(s,Map.class); }
    public void day(LocalDate date,DailyRecord in) {
        require(in.date()==null||date.equals(in.date()),"요청 날짜가 일치하지 않습니다.");
        Double[] values={in.morningWeight(),in.targetWeight(),in.morningGlucose(),in.morningBreathKetone(),in.bedtimeGlucose(),in.bedtimeBreathKetone(),in.morningBloodKetone(),in.bedtimeBloodKetone(),in.waistCircumference(),in.fastingHours()};
        for(int i=0;i<values.length;i++)value(values[i],i==0||i==1||i==8);
        lock();
        String columns="morning_weight,target_weight,morning_glucose,morning_breath_ketone,bedtime_glucose,bedtime_breath_ketone,morning_blood_ketone,bedtime_blood_ketone,waist_circumference,fasting_hours";
        var args=new ArrayList<Object>();args.add(owner());args.add(date);args.addAll(Arrays.asList(values));
        String updates=String.join(",",Arrays.stream(columns.split(",")).map(c->c+"=excluded."+c).toList());
        db.update("insert into diet_days(owner_id,entry_date,"+columns+") values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(owner_id,entry_date) do update set "+updates+",updated_at=now()",args.toArray());
    }
    public void item(UUID id,ChecklistItem in) {
        same(id,in.id());require(in.importance()!=null&&in.startDate()!=null,"중요도와 시작일을 입력하세요.");
        require(in.weeklyReference()==null||in.weeklyReference()>=0&&in.weeklyReference()<=7,"주간 기준은 0–7입니다.");
        require(in.monthlyReference()==null||in.monthlyReference()>=0&&in.monthlyReference()<=31,"월간 기준은 0–31입니다.");
        var title=text(in.title(),200,true);var key=text(in.keyPoint(),2000,false); lock();
        upsert("diet_items",id,"title,importance,key_point,sort_order,weekly_reference,monthly_reference,active,start_date",title,in.importance().name(),key,in.sortOrder(),in.weeklyReference(),in.monthlyReference(),in.active(),in.startDate());
    }
    public void check(LocalDate date,UUID item,DailyCheck in) {
        require(in.state()!=null,"기록 상태를 선택하세요.");same(item,in.itemId());require(in.date()==null||in.date().equals(date),"요청 날짜가 일치하지 않습니다.");
        var memo=text(in.memo(),4000,false);lock();owned("diet_items",item);
        var start=db.queryForObject("select start_date from diet_items where owner_id=? and id=?",LocalDate.class,owner(),item);
        require(!date.isBefore(start),"항목 시작일 이전에는 기록할 수 없습니다.");
        db.update("insert into diet_checks(owner_id,entry_date,item_id,state,memo) values(?,?,?,?,?) on conflict(owner_id,entry_date,item_id) do update set state=excluded.state,memo=excluded.memo",owner(),date,item,in.state().name(),memo);
    }
    public void challenge(UUID id,Challenge in) {
        same(id,in.id());require(in.type()!=null&&in.status()!=null&&in.goalMode()!=null,"도전 유형과 상태를 확인하세요.");
        require(in.startDate()!=null&&in.endDate()!=null&&!in.endDate().isBefore(in.startDate()),"도전 기간을 확인하세요.");
        require(in.color()!=null&&in.color().matches("#[0-9a-fA-F]{6}"),"색상 값을 확인하세요.");
        var title=text(in.title(),200,true);var key=text(in.keyPoint(),2000,false);
        var notes=in.notes()==null?List.<String>of():in.notes();require(notes.size()<=100,"메모는 최대 100개입니다.");notes=notes.stream().map(s->text(s,2000,false)).toList();
        var items=in.itemIds()==null?List.<UUID>of():in.itemIds();require(items.size()<=200&&items.stream().noneMatch(Objects::isNull)&&new HashSet<>(items).size()==items.size(),"체크리스트 항목을 중복 없이 선택하세요.");
        value(in.startWeight(),true);value(in.targetWeight(),true);value(in.currentValue(),false);value(in.targetValue(),true);
        if(in.type()==ChallengeType.WEIGHT)require(in.startWeight()!=null&&in.targetWeight()!=null,"시작 체중과 목표 체중을 입력하세요.");
        if(in.type()==ChallengeType.CHECKLIST) {
            require(!items.isEmpty()&&in.targetValue()!=null,"체크리스트 항목과 목표를 입력하세요.");
            require(in.goalMode()!=GoalMode.RATE||in.targetValue()<=100,"목표 성공률은 100 이하입니다.");
            require(in.goalMode()!=GoalMode.COUNT||in.targetValue()==Math.rint(in.targetValue()),"목표 횟수는 정수입니다.");
        }
        if(in.type()==ChallengeType.MANUAL)require(in.targetValue()!=null,"목표 값을 입력하세요.");
        lock();for(UUID item:items)owned("diet_items",item);
        var oldTypes=db.queryForList("select type from diet_challenges where owner_id=? and id=?",String.class,owner(),id);
        if(!oldTypes.isEmpty()&&!oldTypes.getFirst().equals(in.type().name())) {
            int planning=db.queryForObject("select count(*) from diet_milestones where owner_id=? and challenge_id=?",Integer.class,owner(),id);
            require(planning==0,"목표 또는 마일스톤이 있는 도전의 유형은 변경할 수 없습니다.");
        }
        var role=in.role()==null?(in.status()==ChallengeStatus.WAITING?ChallengeRole.NEXT_FOCUS:ChallengeRole.CURRENT_FOCUS):in.role();
        var oldHomeOrder=db.queryForList("select home_sort_order from diet_challenges where owner_id=? and id=?",Integer.class,owner(),id);
        int homeOrder=in.homeSortOrder()!=null?in.homeSortOrder():oldHomeOrder.isEmpty()?in.sortOrder():oldHomeOrder.getFirst();
        upsert("diet_challenges",id,"title,type,status,start_date,end_date,color,key_point,notes,sort_order,start_weight,target_weight,goal_mode,include_missing,current_value,target_value,role,home_sort_order",title,in.type().name(),in.status().name(),in.startDate(),in.endDate(),in.color(),key,json.writeValueAsString(notes),in.sortOrder(),in.startWeight(),in.targetWeight(),in.goalMode().name(),in.includeMissing(),in.currentValue(),in.targetValue(),role.name(),homeOrder);
        db.update("delete from diet_challenge_items where owner_id=? and challenge_id=?",owner(),id);
        for(int i=0;i<items.size();i++)db.update("insert into diet_challenge_items(owner_id,challenge_id,item_id,position) values(?,?,?,?)",owner(),id,items.get(i),i);
    }
    private List<String> memoItems(List<String> items) {
        var result=items==null?List.<String>of():items;
        require(result.size()<=100,"Memo supports at most 100 items.");
        return result.stream().map(item->text(item,4000,false)).filter(item->!item.isEmpty()).toList();
    }
    public void goal(UUID id,WeightGoal in) {
        same(id,in.id());require(in.kind()!=null&&in.targetDate()!=null&&in.targetWeight()!=null,"Goal type, target date and weight are required.");
        value(in.targetWeight(),true);var core=text(in.core(),2000,false);var memos=memoItems(in.memoItems());lock();
        upsert("diet_global_goals",id,"kind,target_date,target_weight,core,memo_items",in.kind().name(),in.targetDate(),in.targetWeight(),core,json.writeValueAsString(memos));
    }
    public void milestone(UUID id,Milestone in) {
        same(id,in.id());require(in.date()!=null&&in.value()!=null,"날짜와 체중을 입력하세요.");value(in.value(),true);
        var title=text(in.title(),200,false);var memo=text(in.memo(),4000,false);
        var memos=in.memoItems()==null?(memo.isEmpty()?List.<String>of():List.of(memo)):memoItems(in.memoItems());
        lock();owned("diet_challenges",in.challengeId());
        upsert("diet_milestones",id,"challenge_id,entry_date,value,title,memo,memo_items",in.challengeId(),in.date(),in.value(),title,memo,json.writeValueAsString(memos));
    }
    private static String table(String entity) { return switch(entity) {case "items"->"diet_items";case "challenges"->"diet_challenges";case "goals"->"diet_global_goals";case "milestones"->"diet_milestones";default->throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");}; }
    public void delete(String entity,UUID id) {
        String table=table(entity);lock();owned(table,id);
        if(entity.equals("items"))db.update("update diet_items set active=false where owner_id=? and id=?",owner(),id);
        else db.update("delete from "+table+" where owner_id=? and id=?",owner(),id);
    }
    public void order(String entity,OrderInput in) {
        require(entity.equals("items")||entity.equals("challenges"),"정렬할 수 없는 항목입니다.");String table=table(entity);
        require(in.ids()!=null&&in.ids().size()<=10000&&in.ids().stream().noneMatch(Objects::isNull)&&new HashSet<>(in.ids()).size()==in.ids().size(),"정렬 ID를 중복 없이 입력하세요.");
        lock();var all=db.queryForList("select id from "+table+" where owner_id=? order by sort_order,id",UUID.class,owner());
        if(!all.containsAll(in.ids()))throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");
        var selected=new HashSet<>(in.ids());var iterator=in.ids().iterator();
        for(int i=0;i<all.size();i++) { UUID id=all.get(i);if(selected.contains(id))id=iterator.next();db.update("update "+table+" set sort_order=? where owner_id=? and id=?",i,owner(),id); }
    }
    public void homeOrder(HomeOrderInput in) {
        require(in.type()==ChallengeType.WEIGHT||in.type()==ChallengeType.CHECKLIST,"Invalid Home challenge type.");
        require(in.ids()!=null&&in.ids().size()<=10000&&in.ids().stream().noneMatch(Objects::isNull)&&new HashSet<>(in.ids()).size()==in.ids().size(),"Order IDs must be unique.");
        lock();var all=db.queryForList("select id from diet_challenges where owner_id=? and type=? order by home_sort_order,id",UUID.class,owner(),in.type().name());
        if(!all.containsAll(in.ids()))throw new ResourceNotFoundException("Challenge not found.");
        var selected=new HashSet<>(in.ids());var iterator=in.ids().iterator();
        for(int i=0;i<all.size();i++) { UUID id=all.get(i);if(selected.contains(id))id=iterator.next();db.update("update diet_challenges set home_sort_order=? where owner_id=? and type=? and id=?",i,owner(),in.type().name(),id); }
    }
    public void settings(Map<String,Object> in) {
        DietSettingsValidation.validate(in,json);lock();
        db.update("update diet_settings set settings=cast(? as jsonb) where owner_id=?",json.writeValueAsString(in),owner());
    }
}
