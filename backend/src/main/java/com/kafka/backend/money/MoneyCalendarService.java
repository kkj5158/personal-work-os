package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.security.MessageDigest;
import java.util.*;
import static com.kafka.backend.money.MoneyCalendarTypes.*;

/** Independent work receipts: never writes financial ledger facts or WORK OS attendance. */
@Service
@Transactional
public class MoneyCalendarService {
 static final UUID OFF_TEMPLATE_ID=UUID.fromString("00000000-0000-4000-8000-000000000004");
 static final UUID OFF_PRESET_ID=UUID.fromString("00000000-0000-4000-8000-000000000005");
 private final MoneyCalendarRepository repo;private final CurrentUserProvider users;private final ObjectMapper json;
 public MoneyCalendarService(MoneyCalendarRepository repo,CurrentUserProvider users,ObjectMapper json){this.repo=repo;this.users=users;this.json=json;}
 private UUID owner(){return users.getCurrentUserId();}
 private static void require(boolean ok,String message){if(!ok)throw new InvalidRequestException(message);}
 private static void text(String value,int max,boolean mandatory,String field){require(value!=null||!mandatory,field+"을 입력하세요.");if(value!=null)require(value.length()<=max&&(!mandatory||!value.isBlank()),field+"을 확인하세요.");}
 private static void amount(Long value,boolean optional){require(value==null?optional:value>=0&&value<=999999999999L,"금액은 0 이상의 원 단위 정수여야 합니다.");}
 static int duration(String start,String end,boolean overnight,int rest){
  require(start!=null&&end!=null,"시작과 종료 시각을 함께 입력하세요.");var a=LocalTime.parse(start);var b=LocalTime.parse(end);
  require(a.getSecond()==0&&b.getSecond()==0&&a.getNano()==0&&b.getNano()==0,"분 단위 시각을 입력하세요.");
  int raw=b.getHour()*60+b.getMinute()-a.getHour()*60-a.getMinute()+(overnight?1440:0);
  require(raw>0&&raw<=1440&&rest>=0&&rest<raw,"시각·익일 종료·휴게시간을 확인하세요.");return raw-rest;
 }
 private void timing(String start,String end,Boolean overnight,Integer rest,Integer minutes,boolean optional){
  require(overnight!=null&&rest!=null&&rest>=0&&rest<1440&&minutes!=null&&minutes>0&&minutes<=1440,"근무 시간과 휴게시간을 확인하세요.");
  if((start==null||start.isBlank())&&(end==null||end.isBlank())){require(optional&&minutes+rest<=1440,"근무 시각과 총 근무시간을 확인하세요.");return;}
  require(start!=null&&end!=null&&duration(start,end,overnight,rest)==minutes,"실근무 시간은 시각과 휴게시간 계산값과 같아야 합니다.");
 }
 private String hash(Object input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsString(input).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 @SuppressWarnings("unchecked") private Map<String,Object> data(Object input){return new LinkedHashMap<>(json.readValue(json.writeValueAsString(input),Map.class));}
 private static long version(Map<String,Object> row){return ((Number)row.get("version")).longValue();}
 private boolean replay(Map<String,Object> old,Long expected,String hash){return old!=null&&expected!=null&&version(old)==expected+1&&hash.equals(old.get("_request"));}
 private void check(String kind,UUID id,Map<String,Object> old,Long expected){
  require(id!=null,"식별자가 필요합니다.");if(old==null&&repo.exists(kind,id))throw new ResourceNotFoundException("기록을 찾을 수 없습니다.");
  if(expected==null||(old==null?expected!=0:expected!=version(old)))throw new OptimisticLockConflictException("기록이 변경되었습니다. 초안을 보존하고 다시 불러오세요.");
 }
 private Map<String,Object> clean(Map<String,Object> row){var out=new LinkedHashMap<>(row);out.remove("_request");return out;}
 private Map<String,Object> transitionSnapshot(Map<String,Object> row){var out=clean(row);for(String f:List.of("offTransitionHistory","earningsTransitionHistory","legacyWageSnapshot"))out.remove(f);return out;}
 private Map<String,Object> offTemplate(){var out=data(new TemplateInput(0L,"🏠 휴무",0,null,null,0,false,"","",true,List.of(new Preset(OFF_PRESET_ID,"휴무",0L,true)),OFF_PRESET_ID));out.remove("expectedVersion");out.put("id",OFF_TEMPLATE_ID);out.put("version",0L);out.put("builtIn","OFF");return out;}
 @Transactional(readOnly=true) public List<Map<String,Object>> templates(){var out=new ArrayList<>(repo.list("template",owner()).stream().filter(r->!OFF_TEMPLATE_ID.equals(r.get("id"))).map(this::clean).toList());out.add(offTemplate());return out;}
 @Transactional(readOnly=true) public Map<String,Object> template(UUID id){if(OFF_TEMPLATE_ID.equals(id))return offTemplate();var row=repo.find("template",owner(),id);if(row==null)throw new ResourceNotFoundException("템플릿을 찾을 수 없습니다.");return clean(row);}
 @Transactional(readOnly=true) public Map<String,Object> record(UUID id){var row=repo.find("work",owner(),id);if(row==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");return workResponse(row,repo.payments(owner()));}
 @SuppressWarnings("unchecked") public Map<String,Object> saveTemplate(UUID id,TemplateInput in){
  require(in!=null,"템플릿을 입력하세요.");require(!OFF_TEMPLATE_ID.equals(id),"기본 휴무 템플릿은 수정할 수 없습니다.");repo.lock(owner());var old=repo.find("template",owner(),id);String hash=hash(in);
  if(replay(old,in.expectedVersion(),hash))return clean(old);check("template",id,old,in.expectedVersion());
  text(in.name(),120,true,"템플릿 이름");text(in.shiftDescription(),240,false,"시간대 설명");text(in.groupName(),120,false,"근무조");timing(in.startTime(),in.endTime(),in.overnight(),in.breakMinutes(),in.durationMinutes(),true);
  require(in.active()!=null&&in.presets()!=null&&!in.presets().isEmpty()&&in.presets().size()<=100,"프리셋을 입력하세요.");
  var ids=new HashSet<UUID>();for(var p:in.presets()){require(p!=null&&p.id()!=null&&ids.add(p.id())&&p.active()!=null,"프리셋 식별자가 중복되었거나 잘못되었습니다.");text(p.name(),120,true,"프리셋 이름");amount(p.amount(),false);}
  if(old!=null)for(var prior:(List<Map<String,Object>>)old.get("presets"))require(ids.contains(UUID.fromString(prior.get("id").toString())),"기존 프리셋은 삭제 대신 비활성화하세요.");
  require(!in.active()||in.presets().stream().anyMatch(p->p.active()&&p.id().equals(in.defaultPresetId())),"활성 템플릿에는 활성 기본 프리셋이 필요합니다.");
  var value=data(in);value.remove("expectedVersion");repo.save("template",owner(),id,value,old==null?1:version(old)+1,hash,null,old==null);return clean(repo.find("template",owner(),id));
 }
 public Map<String,Object> saveWork(UUID id,WorkInput in){return saveWork(id,in,null);}
 public Map<String,Object> saveEarnings(UUID id,EarningsInput in){
  require(in!=null&&in.workDate()!=null,"근무 날짜를 입력하세요.");long pay=earningsPay(in);
  if(Set.of("OFF","CANCELLED").contains(in.status()==null?"":in.status()))require(pay==0&&in.dailyIncentive()==0&&(directEarnings(in)||in.basePay()==0&&in.totalDeduction()==0),"휴무·취소로 바꾸려면 급여와 인센을 명시적으로 0원으로 저장하세요. 이전 값은 이력에 보관됩니다.");
  repo.lock(owner());var old=repo.find("work",owner(),id);long legacyExpected=old==null?0:number(old.get("expectedAmount"));if("CANCELLED".equals(in.status()))legacyExpected=0;
  var work=new WorkInput(in.expectedVersion(),in.workDate(),in.status(),in.templateId(),in.presetId(),in.startTime(),in.endTime(),in.overnight(),in.breakMinutes(),in.durationMinutes(),legacyExpected,in.memo(),null,in.saveAsPresetName());
  saveWork(id,work,in);return earningsRecord(id);
 }
 @SuppressWarnings("unchecked") private Map<String,Object> saveWork(UUID id,WorkInput in,EarningsInput earnings){
  require(in!=null&&in.workDate()!=null,"근무 날짜를 입력하세요.");repo.lock(owner());var old=repo.find("work",owner(),id);String hash=earnings==null?hash(in):earningsHash(earnings);
  if(earnings==null&&old!=null&&confirmedModel(old))throw new OptimisticLockConflictException("확정 일당 기록은 최신 급여 편집기에서 수정하세요. 기존 입력은 보존되었습니다.");
  if(replay(old,in.expectedVersion(),hash))return workResponse(old,repo.payments(owner()));check("work",id,old,in.expectedVersion());
  if(earnings!=null&&!directEarnings(earnings)&&old!=null&&"CONFIRMED_DIRECT_V3".equals(old.get("wageModel")))throw new OptimisticLockConflictException("직접 확정 급여는 최신 급여 편집기에서 수정하세요. 기존 입력은 보존되었습니다.");
  if(old!=null&&in.payments()==null&&!in.workDate().toString().equals(old.get("workDate")))require(!repo.hasPayments(owner(),id),"입금 이력이 있는 근무의 날짜는 입금 보존 모드에서 변경할 수 없습니다.");
  require(Set.of("SCHEDULED","COMPLETED","OFF","CANCELLED").contains(in.status()==null?"":in.status()),"근무 상태를 확인하세요.");
  var today=LocalDate.now(ZoneId.of("Asia/Seoul"));require(!in.status().equals("COMPLETED")||!in.workDate().isAfter(today),"미래 근무는 예정으로 기록하세요.");
  boolean off=in.status().equals("OFF");text(in.memo(),2000,false,"메모");if(!off)amount(in.expectedAmount(),false);require(in.payments()==null||in.payments().size()<=100,"입금 내역을 확인하세요.");
  var value=data(in);value.remove("expectedVersion");value.remove("saveAsPresetName");value.remove("payments");value.put("removed",false);if(old!=null)for(String f:List.of("offTransitionHistory","earningsTransitionHistory"))if(old.containsKey(f))value.put(f,old.get(f));boolean working=Set.of("SCHEDULED","COMPLETED").contains(in.status());
  if(working){timing(in.startTime(),in.endTime(),in.overnight(),in.breakMinutes(),in.durationMinutes(),false);require(in.templateId()!=null&&in.presetId()!=null,"템플릿과 프리셋을 선택하세요.");}
  else{if(!off)require(in.expectedAmount()==0,"취소의 예상액은 0원이어야 합니다.");value.put("durationMinutes",0);}
  boolean same=old!=null&&Objects.equals(old.get("templateId"),in.templateId()==null?null:in.templateId().toString())&&Objects.equals(old.get("presetId"),in.presetId()==null?null:in.presetId().toString());Map<String,Object> selectedTemplate=null;
  if(off){
   if(old!=null&&!"OFF".equals(old.get("status"))){var history=new ArrayList<>((List<Map<String,Object>>)old.getOrDefault("offTransitionHistory",List.of()));history.add(transitionSnapshot(old));value.put("offTransitionHistory",history);}
   value.put("templateId",null);value.put("presetId",null);value.put("templateName","휴무");value.put("presetName","휴무");value.put("presetAmount",0);value.put("templateSnapshot",offTemplate());value.put("startTime",null);value.put("endTime",null);value.put("overnight",false);value.put("breakMinutes",0);value.put("durationMinutes",0);value.put("expectedAmount",0);
  }
  else if(same){for(String field:List.of("templateName","presetName","presetAmount","templateSnapshot"))value.put(field,old.get(field));}
  else if(in.templateId()!=null){
   selectedTemplate=repo.find("template",owner(),in.templateId());if(selectedTemplate==null)throw new ResourceNotFoundException("템플릿을 찾을 수 없습니다.");require(Boolean.TRUE.equals(selectedTemplate.get("active")),"비활성 템플릿은 새로 선택할 수 없습니다.");
   var preset=((List<Map<String,Object>>)selectedTemplate.get("presets")).stream().filter(p->Objects.equals(p.get("id"),in.presetId()==null?null:in.presetId().toString())).findFirst().orElseThrow(()->new InvalidRequestException("프리셋을 선택하세요."));require(Boolean.TRUE.equals(preset.get("active")),"비활성 프리셋은 새로 선택할 수 없습니다.");
   value.put("templateName",selectedTemplate.get("name"));value.put("presetName",preset.get("name"));value.put("presetAmount",preset.get("amount"));value.put("templateSnapshot",clean(selectedTemplate));
  }
  var paymentIds=new HashSet<UUID>();if(in.payments()!=null)for(var p:in.payments()){require(p!=null&&p.id()!=null&&paymentIds.add(p.id()),"입금 식별자가 중복되었습니다.");amount(p.amount(),false);require(in.status().equals("COMPLETED")&&p.amount()>0&&p.depositDate()!=null&&!p.depositDate().isBefore(in.workDate())&&!p.depositDate().isAfter(today),"입금은 완료 근무일 이후부터 오늘까지의 양수 금액이어야 합니다.");}
  if(repo.workDateOccupied(owner(),in.workDate(),id))throw new OptimisticLockConflictException("해당 날짜에 근무 기록이 이미 있습니다. 기존 기록을 여세요.");if(in.payments()!=null)repo.validatePayments(owner(),id,in.payments());
  if(in.saveAsPresetName()!=null&&!in.saveAsPresetName().isBlank()){
   text(in.saveAsPresetName(),120,true,"새 프리셋 이름");require(working&&in.templateId()!=null,"근무 템플릿을 선택하세요.");if(selectedTemplate==null)selectedTemplate=repo.find("template",owner(),in.templateId());require(selectedTemplate!=null&&Boolean.TRUE.equals(selectedTemplate.get("active")),"활성 템플릿을 선택하세요.");
   var presets=new ArrayList<>((List<Map<String,Object>>)selectedTemplate.get("presets"));require(presets.size()<100,"프리셋은 100개까지 저장할 수 있습니다.");var presetId=UUID.randomUUID();long presetAmount=earnings==null?in.expectedAmount():!directEarnings(earnings)?earnings.basePay():number(value.get("presetAmount"));presets.add(Map.of("id",presetId.toString(),"name",in.saveAsPresetName(),"amount",presetAmount,"active",true));
   var updated=clean(selectedTemplate);updated.remove("id");updated.remove("version");updated.put("presets",presets);repo.save("template",owner(),in.templateId(),updated,version(selectedTemplate)+1,hash,null,false);
   value.put("presetId",presetId.toString());value.put("presetName",in.saveAsPresetName());value.put("presetAmount",presetAmount);
  }
  if(earnings!=null){
   if(old!=null&&confirmedModel(old)&&((working(old)&&"CANCELLED".equals(in.status()))||(directEarnings(earnings)&&"CONFIRMED_V2".equals(old.get("wageModel"))))){var history=new ArrayList<>((List<Map<String,Object>>)old.getOrDefault("earningsTransitionHistory",List.of()));history.add(transitionSnapshot(old));value.put("earningsTransitionHistory",history);}
   if(old!=null&&old.containsKey("legacyWageSnapshot"))value.put("legacyWageSnapshot",old.get("legacyWageSnapshot"));
   else if(old!=null&&!confirmedModel(old)){var snapshot=clean(old);snapshot.put("sourceUpdatedAt",repo.workUpdatedAt(owner(),id));value.put("legacyWageSnapshot",snapshot);}
   if(!directEarnings(earnings)){value.put("wageModel","CONFIRMED_V2");value.put("basePay",earnings.basePay());value.put("totalDeduction",earnings.totalDeduction());}
   else{value.put("wageModel","CONFIRMED_DIRECT_V3");for(String f:List.of("basePay","totalDeduction"))if(old!=null&&old.containsKey(f))value.put(f,old.get(f));}
   value.put("dailyIncentive",earnings.dailyIncentive());value.put("confirmedDailyPay",earningsPay(earnings));
  }
  repo.save("work",owner(),id,value,old==null?1:version(old)+1,hash,in.workDate(),old==null);if(in.payments()!=null)repo.payments(owner(),id,in.payments());return workResponse(repo.find("work",owner(),id),repo.payments(owner()));
 }
 public Map<String,Object> removeOff(UUID id,RemoveOffInput in){
  require(in!=null,"기록 버전이 필요합니다.");repo.lock(owner());var old=repo.find("work",owner(),id);if(old==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");String hash=hash(List.of("remove-off",in));
  if(replay(old,in.expectedVersion(),hash))return workResponse(old,repo.payments(owner()));check("work",id,old,in.expectedVersion());require("OFF".equals(old.get("status")),"휴무 기록만 제거할 수 있습니다.");
  if(confirmedModel(old))require(number(old.get("dailyIncentive"))==0&&number(old.get("confirmedDailyPay"))==0&&(!"CONFIRMED_V2".equals(old.get("wageModel"))||number(old.get("basePay"))==0&&number(old.get("totalDeduction"))==0),"금액이 있는 확정 일당 기록은 먼저 명시적으로 정정하세요.");
  var value=clean(old);value.remove("id");value.remove("version");value.put("removed",true);repo.save("work",owner(),id,value,version(old)+1,hash,LocalDate.parse(old.get("workDate").toString()),false);return workResponse(repo.find("work",owner(),id),repo.payments(owner()));
 }
 private Map<String,Object> workResponse(Map<String,Object> row,List<Map<String,Object>> payments){var out=clean(row);out.put("payments",payments.stream().filter(p->p.get("workRecordId").equals(row.get("id"))).toList());return out;}
 private static boolean between(Object date,LocalDate start,LocalDate end){var d=LocalDate.parse(date.toString());return !d.isBefore(start)&&!d.isAfter(end);}
 private static long number(Object value){return value==null?0:((Number)value).longValue();}
 private long outstanding(Map<String,Object> work,List<Map<String,Object>> payments){long paid=payments.stream().filter(p->p.get("workRecordId").equals(work.get("id"))).mapToLong(p->number(p.get("amount"))).sum();return Math.max(0,number(work.get("expectedAmount"))-paid);}
 @Transactional(readOnly=true) public Map<String,Object> month(String month){
  var selected=YearMonth.parse(month);var start=selected.atDay(1);var end=selected.atEndOfMonth();var payments=repo.payments(owner());var all=repo.list("work",owner());var records=all.stream().filter(r->between(r.get("workDate"),start,end)).toList();var completed=records.stream().filter(r->"COMPLETED".equals(r.get("status"))).toList();
  var summary=Map.of("completedWorkdays",completed.size(),"completedMinutes",completed.stream().mapToLong(r->number(r.get("durationMinutes"))).sum(),"receivedAmount",payments.stream().filter(p->between(p.get("depositDate"),start,end)).mapToLong(p->number(p.get("amount"))).sum(),"outstandingAmount",completed.stream().mapToLong(r->outstanding(r,payments)).sum(),"scheduledAmount",records.stream().filter(r->"SCHEDULED".equals(r.get("status"))&&!LocalDate.parse(r.get("workDate").toString()).isBefore(LocalDate.now(ZoneId.of("Asia/Seoul")))).mapToLong(r->number(r.get("expectedAmount"))).sum());
  var weeks=new ArrayList<Map<String,Object>>();for(var d=start.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));!d.isAfter(end);d=d.plusWeeks(1))weeks.add(weekResponse(d,repo.week(owner(),d),all,payments));return Map.of("records",records.stream().map(r->workResponse(r,payments)).toList(),"payments",payments.stream().filter(p->between(p.get("depositDate"),start,end)).toList(),"weeks",weeks,"summary",summary);
 }
 private void monday(LocalDate start){require(start!=null&&start.getDayOfWeek()==DayOfWeek.MONDAY,"월요일 시작 날짜를 선택하세요.");}
 @Transactional(readOnly=true) public Map<String,Object> week(LocalDate start){monday(start);return weekResponse(start,repo.week(owner(),start),repo.list("work",owner()),repo.payments(owner()));}
 private static final List<String> ALLOWANCES=List.of("specialWorkAllowance","weeklyHolidayAllowance","publicHolidayAllowance","incentive");
 static LocalDate[] visibleRange(String month){var m=YearMonth.parse(month);return new LocalDate[]{m.atDay(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)),m.atEndOfMonth().with(TemporalAdjusters.nextOrSame(DayOfWeek.SATURDAY))};}
 private static boolean active(Map<String,Object> row){return !Boolean.TRUE.equals(row.get("removed"));}
 static long confirmedDailyPay(Long base,Long incentive,Long deduction){amount(base,false);amount(incentive,false);amount(deduction,false);long total=base+incentive-deduction;require(total>=0,"공제총액이 기본급과 인센의 합보다 큽니다. 공제액을 확인하세요.");require(total<=999999999999L,"확정 일당은 999,999,999,999원 이하여야 합니다.");return total;}
 private static boolean working(Map<String,Object> row){return active(row)&&Set.of("SCHEDULED","COMPLETED").contains(row.get("status"));}
 static boolean confirmedEarnings(Map<String,Object> row){if("CONFIRMED_DIRECT_V3".equals(row.get("wageModel")))return row.get("confirmedDailyPay") instanceof Number&&row.get("dailyIncentive") instanceof Number&&number(row.get("confirmedDailyPay"))>=0&&number(row.get("confirmedDailyPay"))<=999999999999L&&number(row.get("dailyIncentive"))>=0&&number(row.get("dailyIncentive"))<=number(row.get("confirmedDailyPay"));return "CONFIRMED_V2".equals(row.get("wageModel"))&&row.get("basePay") instanceof Number&&row.get("dailyIncentive") instanceof Number&&row.get("totalDeduction") instanceof Number&&row.get("confirmedDailyPay") instanceof Number&&number(row.get("basePay"))>=0&&number(row.get("dailyIncentive"))>=0&&number(row.get("totalDeduction"))>=0&&number(row.get("confirmedDailyPay"))>=0&&number(row.get("basePay"))+number(row.get("dailyIncentive"))-number(row.get("totalDeduction"))==number(row.get("confirmedDailyPay"));}
 static long directDailyPay(Long pay,Long incentive){amount(pay,false);amount(incentive,false);require(incentive<=pay,"포함 인센티브는 확정 일급을 초과할 수 없습니다.");return pay;}
 private static boolean directEarnings(EarningsInput in){return in.confirmedDailyPay()!=null&&in.basePay()==null&&in.totalDeduction()==null;}
 private static long earningsPay(EarningsInput in){return !directEarnings(in)?confirmedDailyPay(in.basePay(),in.dailyIncentive(),in.totalDeduction()):directDailyPay(in.confirmedDailyPay(),in.dailyIncentive());}
 private String earningsHash(EarningsInput in){var payload=data(in);if(!directEarnings(in))payload.remove("confirmedDailyPay");return hash(List.of(!directEarnings(in)?"CONFIRMED_V2":"CONFIRMED_DIRECT_V3",payload));}
 private static boolean confirmedModel(Map<String,Object> row){return "CONFIRMED_V2".equals(row.get("wageModel"))||"CONFIRMED_DIRECT_V3".equals(row.get("wageModel"));}
 static boolean legacyReviewRequired(Map<String,Object> row,LocalDate today){if(!working(row)||confirmedEarnings(row))return false;var day=LocalDate.parse(row.get("workDate").toString());return day.isBefore(today)||day.equals(today)&&"COMPLETED".equals(row.get("status"));}
 private static boolean legacyReviewRequired(Map<String,Object> row){return legacyReviewRequired(row,LocalDate.now(ZoneId.of("Asia/Seoul")));}
 private Map<String,Object> earningsResponse(Map<String,Object> row,List<Map<String,Object>> payments){var out=workResponse(row,payments);boolean confirmed=confirmedEarnings(row);out.put("wageCompatibility",confirmed?row.get("wageModel"):legacyReviewRequired(row)?"LEGACY_REVIEW_REQUIRED":"NOT_APPLICABLE");if(!confirmed)for(String f:List.of("basePay","dailyIncentive","totalDeduction","confirmedDailyPay"))out.put(f,null);return out;}
 @Transactional(readOnly=true) public Map<String,Object> earningsRecord(UUID id){var row=repo.find("work",owner(),id);if(row==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");return earningsResponse(row,repo.payments(owner()));}
 @Transactional(readOnly=true) public Map<String,Object> earningsCalendar(String month){
  var selected=YearMonth.parse(month);var grid=visibleRange(month);var all=repo.list("work",owner());var payments=repo.payments(owner());var visible=all.stream().filter(r->between(r.get("workDate"),grid[0],grid[1])).toList();var nominal=all.stream().filter(MoneyCalendarService::working).filter(r->between(r.get("workDate"),selected.atDay(1),selected.atEndOfMonth())).toList();var confirmed=nominal.stream().filter(MoneyCalendarService::confirmedEarnings).toList();var legacy=nominal.stream().filter(MoneyCalendarService::legacyReviewRequired).toList();
  var summary=new LinkedHashMap<String,Object>();summary.put("baseTotal",confirmed.stream().mapToLong(r->number(r.get("basePay"))).sum());summary.put("incentiveTotal",confirmed.stream().mapToLong(r->number(r.get("dailyIncentive"))).sum());summary.put("deductionTotal",confirmed.stream().mapToLong(r->number(r.get("totalDeduction"))).sum());summary.put("confirmedDailyPay",confirmed.stream().mapToLong(r->number(r.get("confirmedDailyPay"))).sum());summary.put("workdays",nominal.size());summary.put("workMinutes",nominal.stream().mapToLong(r->number(r.get("durationMinutes"))).sum());summary.put("legacyReviewCount",legacy.size());summary.put("legacyRecordedAmount",legacy.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());
  var weeks=new ArrayList<Map<String,Object>>();for(var d=grid[0];!d.isAfter(grid[1]);d=d.plusWeeks(1))weeks.add(earningsWeekResponse(d,repo.earningsWeek(owner(),d),all));
  var legacyStarts=new TreeSet<LocalDate>();for(String d:repo.payWeekStarts(owner()))legacyStarts.add(LocalDate.parse(d));for(var r:all)if(working(r))legacyStarts.add(LocalDate.parse(r.get("workDate").toString()).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)));
  var historical=new ArrayList<Map<String,Object>>();for(var d:legacyStarts){var saved=repo.payWeek(owner(),d);var old=payWeekResponse(d,saved,all);if(saved!=null||number(old.get("totalPay"))>0){old.put("readOnly",true);old.put("wageCompatibility","LEGACY_REVIEW_REQUIRED");historical.add(old);}}
  return Map.of("gridStart",grid[0].toString(),"gridEnd",grid[1].toString(),"records",visible.stream().filter(MoneyCalendarService::active).map(r->earningsResponse(r,payments)).toList(),"archivedRecords",visible.stream().filter(r->!active(r)).map(r->earningsResponse(r,payments)).toList(),"summary",summary,"weeks",weeks,"legacyWeeks",historical,"legacyDepositWeeks",payCalendar(month).get("legacyWeeks"));
 }
 @Transactional(readOnly=true) public Map<String,Object> earningsWeek(LocalDate start){sunday(start);return earningsWeekResponse(start,repo.earningsWeek(owner(),start),repo.list("work",owner()));}
 private Map<String,Object> earningsWeekResponse(LocalDate start,Map<String,Object> saved,List<Map<String,Object>> all){
  var entries=all.stream().filter(MoneyCalendarService::working).filter(r->between(r.get("workDate"),start,start.plusDays(6))).sorted(Comparator.comparing(r->r.get("id").toString())).toList();var confirmed=entries.stream().filter(MoneyCalendarService::confirmedEarnings).toList();
  long base=confirmed.stream().mapToLong(r->number(r.get("basePay"))).sum(),incentive=confirmed.stream().mapToLong(r->number(r.get("dailyIncentive"))).sum(),deduction=confirmed.stream().mapToLong(r->number(r.get("totalDeduction"))).sum(),daily=confirmed.stream().mapToLong(r->number(r.get("confirmedDailyPay"))).sum();
  var out=saved==null?new LinkedHashMap<String,Object>():new LinkedHashMap<>(clean(saved));long special=number(out.get("specialWorkAllowance")),rest=number(out.get("weeklyHolidayAllowance"));out.put("specialWorkAllowance",special);out.put("weeklyHolidayAllowance",rest);out.put("start",start.toString());out.put("end",start.plusDays(6).toString());out.put("version",saved==null?0L:version(saved));out.put("baseTotal",base);out.put("incentiveTotal",incentive);out.put("deductionTotal",deduction);out.put("dailyTotal",daily);out.put("finalPay",daily+special+rest);out.put("aggregationBasis","CONFIRMED_DAILY_V2");
  var legacy=entries.stream().filter(MoneyCalendarService::legacyReviewRequired).toList();out.put("legacyReviewCount",legacy.size());out.put("legacyRecordedAmount",legacy.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());out.put("workEntries",confirmed.stream().map(this::clean).toList());out.put("legacyEntries",legacy.stream().map(this::clean).toList());
  var facts=entries.stream().map(r->{var fact=new LinkedHashMap<String,Object>();for(String f:List.of("id","version","workDate","status","wageModel","basePay","dailyIncentive","totalDeduction","confirmedDailyPay"))fact.put(f,r.get(f));return fact;}).toList();out.put("dailyFingerprint",hash(facts));return out;
 }
 public Map<String,Object> saveEarningsWeek(LocalDate start,EarningsWeekInput in){
  sunday(start);require(in!=null,"주간 수당을 입력하세요.");amount(in.specialWorkAllowance(),false);amount(in.weeklyHolidayAllowance(),false);repo.lock(owner());var old=repo.earningsWeek(owner(),start);UUID id=old==null?UUID.randomUUID():(UUID)old.get("id");String hash=hash(in);if(replay(old,in.expectedVersion(),hash))return earningsWeek(start);check("earningsWeek",id,old,in.expectedVersion());
  if(!Objects.equals(in.expectedDailyFingerprint(),earningsWeek(start).get("dailyFingerprint")))throw new OptimisticLockConflictException("일별 급여 구성이 변경되었습니다. 초안을 보존하고 다시 불러오세요.");
  var value=data(in);value.remove("expectedVersion");value.remove("expectedDailyFingerprint");repo.save("earningsWeek",owner(),id,value,old==null?1:version(old)+1,hash,start,old==null);return earningsWeek(start);
 }
 @Transactional(readOnly=true) public Map<String,Object> payCalendar(String month){
  var selected=YearMonth.parse(month);var first=selected.atDay(1);var last=selected.atEndOfMonth();var grid=visibleRange(month);var all=repo.list("work",owner());var payments=repo.payments(owner());
  var visible=all.stream().filter(r->between(r.get("workDate"),grid[0],grid[1])).toList();var nominal=all.stream().filter(MoneyCalendarService::active).filter(r->between(r.get("workDate"),first,last)).toList();var completed=nominal.stream().filter(r->"COMPLETED".equals(r.get("status"))).toList();var today=LocalDate.now(ZoneId.of("Asia/Seoul"));
  var summary=Map.of("completedWorkdays",completed.size(),"completedMinutes",completed.stream().mapToLong(r->number(r.get("durationMinutes"))).sum(),"receivableAmount",completed.stream().mapToLong(r->number(r.get("expectedAmount"))).sum(),"scheduledAmount",nominal.stream().filter(r->"SCHEDULED".equals(r.get("status"))&&!LocalDate.parse(r.get("workDate").toString()).isBefore(today)).mapToLong(r->number(r.get("expectedAmount"))).sum());
  var weeks=new ArrayList<Map<String,Object>>();for(var d=grid[0];!d.isAfter(grid[1]);d=d.plusWeeks(1))weeks.add(payWeekResponse(d,repo.payWeek(owner(),d),all));
  var legacyStarts=new TreeSet<LocalDate>();for(String d:repo.legacyWeekStarts(owner()))legacyStarts.add(LocalDate.parse(d));for(var p:payments)legacyStarts.add(LocalDate.parse(p.get("depositDate").toString()).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
  var legacy=new ArrayList<Map<String,Object>>();for(var d:legacyStarts){var old=weekResponse(d,repo.week(owner(),d),all,payments);if(number(old.get("version"))>0||number(old.get("totalPay"))>0){old.put("aggregationBasis","LEGACY_DEPOSIT_DATE");old.put("readOnly",true);legacy.add(old);}}
  return Map.of("gridStart",grid[0].toString(),"gridEnd",grid[1].toString(),"records",visible.stream().filter(MoneyCalendarService::active).map(r->workResponse(r,payments)).toList(),"archivedRecords",visible.stream().filter(r->!active(r)).map(r->workResponse(r,payments)).toList(),"summary",summary,"weeks",weeks,"legacyWeeks",legacy);
 }
 private void sunday(LocalDate start){require(start!=null&&start.getDayOfWeek()==DayOfWeek.SUNDAY,"일요일 시작 날짜를 선택하세요.");}
 @Transactional(readOnly=true) public Map<String,Object> payWeek(LocalDate start){sunday(start);return payWeekResponse(start,repo.payWeek(owner(),start),repo.list("work",owner()));}
 private Map<String,Object> payWeekResponse(LocalDate start,Map<String,Object> saved,List<Map<String,Object>> records){
  var end=start.plusDays(6);var entries=records.stream().filter(MoneyCalendarService::active).filter(r->"COMPLETED".equals(r.get("status"))&&between(r.get("workDate"),start,end)).toList();long total=entries.stream().mapToLong(r->number(r.get("expectedAmount"))).sum();
  var result=saved==null?new LinkedHashMap<String,Object>():new LinkedHashMap<>(clean(saved));result.put("start",start.toString());result.put("end",end.toString());result.put("version",saved==null?0L:version(saved));result.put("totalPay",total);result.put("receivableAmount",total);result.put("aggregationBasis","WORK_DATE_RECEIVABLE");result.put("payments",List.of());result.put("workEntries",entries.stream().map(this::clean).toList());
  for(String field:ALLOWANCES)result.putIfAbsent(field,null);boolean complete=ALLOWANCES.stream().allMatch(f->result.get(f)!=null);long sum=ALLOWANCES.stream().mapToLong(f->number(result.get(f))).sum();boolean review=saved!=null&&complete&&(sum>total||number(saved.get("confirmedTotalPay"))!=total);
  result.put("needsReview",review);result.put("allowancesConfirmed",complete&&!review);result.put("basePay",complete&&!review?total-sum:null);result.put("completedWorkdays",entries.size());result.put("completedMinutes",entries.stream().mapToLong(r->number(r.get("durationMinutes"))).sum());return result;
 }
 public Map<String,Object> savePayWeek(LocalDate start,WeekInput in){
  sunday(start);require(in!=null,"수당을 입력하세요.");repo.lock(owner());var old=repo.payWeek(owner(),start);UUID id=old==null?UUID.randomUUID():(UUID)old.get("id");String hash=hash(in);if(replay(old,in.expectedVersion(),hash))return payWeek(start);check("payWeek",id,old,in.expectedVersion());
  var data=data(in);data.remove("expectedVersion");data.remove("expectedTotalPay");for(String field:ALLOWANCES)amount(data.get(field)==null?null:number(data.get(field)),true);long total=number(payWeek(start).get("totalPay")),sum=ALLOWANCES.stream().mapToLong(f->number(data.get(f))).sum();
  if(in.expectedTotalPay()==null||in.expectedTotalPay()!=total)throw new OptimisticLockConflictException("근무일의 수령 예정액이 변경되었습니다. 초안을 보존하고 다시 불러오세요.");
  require(sum<=total,"수당 합계가 주급 총액을 초과합니다.");data.put("confirmedTotalPay",total);repo.save("payWeek",owner(),id,data,old==null?1:version(old)+1,hash,start,old==null);return payWeek(start);
 }
 private Map<String,Object> weekResponse(LocalDate start,Map<String,Object> saved,List<Map<String,Object>> records,List<Map<String,Object>> payments){
  var end=start.plusDays(6);var included=payments.stream().filter(p->between(p.get("depositDate"),start,end)).toList();long total=included.stream().mapToLong(p->number(p.get("amount"))).sum();var result=saved==null?new LinkedHashMap<String,Object>():new LinkedHashMap<>(clean(saved));result.put("start",start.toString());result.put("end",end.toString());result.put("version",saved==null?0:version(saved));result.put("totalPay",total);result.put("payments",included);for(String field:ALLOWANCES)result.putIfAbsent(field,null);
  boolean complete=ALLOWANCES.stream().allMatch(f->result.get(f)!=null);long sum=ALLOWANCES.stream().mapToLong(f->number(result.get(f))).sum();boolean review=saved!=null&&complete&&(sum>total||number(saved.get("confirmedTotalPay"))!=total);result.put("needsReview",review);result.put("allowancesConfirmed",complete&&!review);result.put("basePay",complete&&!review?total-sum:null);
  var completed=records.stream().filter(r->between(r.get("workDate"),start,end)&&"COMPLETED".equals(r.get("status"))).toList();result.put("completedWorkdays",completed.size());result.put("completedMinutes",completed.stream().mapToLong(r->number(r.get("durationMinutes"))).sum());result.put("outstandingAmount",completed.stream().mapToLong(r->outstanding(r,payments)).sum());return result;
 }
 public Map<String,Object> saveWeek(LocalDate start,WeekInput in){
  monday(start);require(in!=null,"수당을 입력하세요.");repo.lock(owner());var old=repo.week(owner(),start);UUID id=old==null?UUID.randomUUID():(UUID)old.get("id");String hash=hash(in);if(replay(old,in.expectedVersion(),hash))return week(start);check("week",id,old,in.expectedVersion());
  var data=data(in);data.remove("expectedVersion");data.remove("expectedTotalPay");for(String field:ALLOWANCES)amount(data.get(field)==null?null:number(data.get(field)),true);long total=number(week(start).get("totalPay")),sum=ALLOWANCES.stream().mapToLong(f->number(data.get(f))).sum();
  if(in.expectedTotalPay()==null||in.expectedTotalPay()!=total)throw new OptimisticLockConflictException("주급에 포함된 입금이 변경되었습니다. 초안을 보존하고 다시 불러오세요.");
  require(sum<=total,"수당 합계가 주급 총액을 초과합니다.");data.put("confirmedTotalPay",total);repo.save("week",owner(),id,data,old==null?1:version(old)+1,hash,start,old==null);return week(start);
 }
}
