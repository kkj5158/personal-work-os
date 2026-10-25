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
 private Map<String,Object> transitionSnapshot(Map<String,Object> row){var out=clean(row);for(String f:List.of("offTransitionHistory","earningsTransitionHistory","legacyWageSnapshot","receiptConfirmationHistory"))out.remove(f);return out;}
 private Map<String,Object> offTemplate(){var out=data(new TemplateInput(0L,"🏠 휴무",0,null,null,0,false,"","",true,List.of(new Preset(OFF_PRESET_ID,"휴무",0L,true)),OFF_PRESET_ID));out.remove("expectedVersion");out.put("id",OFF_TEMPLATE_ID);out.put("version",0L);out.put("builtIn","OFF");return out;}
 @Transactional(readOnly=true) public List<Map<String,Object>> workplaces(){return repo.list("workplace",owner()).stream().map(this::clean).toList();}
 private UUID workplaceId(Map<String,Object> row){return UUID.fromString(row.getOrDefault("workplaceId",MoneyCalendarRepository.defaultWorkplaceId(owner())).toString());}
 private Map<String,Object> workplace(UUID id){var row=repo.find("workplace",owner(),id);if(row==null)throw new ResourceNotFoundException("근무지를 찾을 수 없습니다.");return row;}
 @SuppressWarnings("unchecked") private List<Map<String,Object>> presets(Map<String,Object> place){return (List<Map<String,Object>>)place.getOrDefault("presets",List.of());}
 private void validatePresets(List<Preset> values){require(values!=null&&values.size()<=100,"프리셋은 100개까지 저장할 수 있습니다.");var ids=new HashSet<UUID>();for(var p:values){require(p!=null&&p.id()!=null&&ids.add(p.id())&&p.active()!=null,"프리셋 식별자를 확인하세요.");text(p.name(),120,true,"프리셋 이름");amount(p.amount(),false);}}
 public Map<String,Object> saveWorkplace(UUID id,WorkplaceInput in){return saveWorkplace(id,in,null);}
 private Map<String,Object> saveWorkplace(UUID id,WorkplaceInput in,UUID editingTemplate){
  require(in!=null&&in.active()!=null,"근무지를 입력하세요.");repo.lock(owner());var old=repo.find("workplace",owner(),id);String hash=hash(in);if(replay(old,in.expectedVersion(),hash))return clean(old);check("workplace",id,old,in.expectedVersion());text(in.name(),120,true,"근무지 이름");validatePresets(in.presets());
  if(old!=null)for(var p:presets(old))require(in.presets().stream().anyMatch(n->n.id().toString().equals(p.get("id").toString())),"기존 프리셋은 삭제 대신 보관하세요.");
  // Preset UUIDs cannot silently cross workplaces, including archived catalogs.
  for(var place:repo.list("workplace",owner()))if(!place.get("id").equals(id))for(var p:presets(place))require(in.presets().stream().noneMatch(n->n.id().toString().equals(p.get("id").toString())),"다른 근무지의 프리셋 식별자입니다.");
  var value=data(in);value.remove("expectedVersion");repo.save("workplace",owner(),id,value,old==null?1:version(old)+1,hash,null,old==null);
  // Version the dependent catalog only; work snapshots and pay are never rewritten.
  boolean changedExisting=old!=null&&presets(old).stream().anyMatch(p->in.presets().stream().noneMatch(n->Objects.equals(data(n),p)));
  if(changedExisting)for(var template:repo.list("template",owner()))if(workplaceId(template).equals(id)&&!template.get("id").equals(editingTemplate)){
   var updated=clean(template);updated.remove("id");updated.remove("version");
   if(in.presets().stream().noneMatch(p->p.active()&&p.id().toString().equals(Objects.toString(updated.get("defaultPresetId"),""))))updated.put("defaultPresetId",null);
   repo.save("template",owner(),(UUID)template.get("id"),updated,version(template)+1,"",null,false);
  }
  return clean(repo.find("workplace",owner(),id));
 }
 private Map<String,Object> templateResponse(Map<String,Object> row,Map<UUID,Map<String,Object>> places){var out=clean(row);var place=places.get(workplaceId(row));if(place!=null){out.put("presets",presets(place));out.put("workplaceName",place.get("name"));out.put("workplaceActive",place.get("active"));}return out;}
 private Map<UUID,Map<String,Object>> workplaceMap(){var map=new LinkedHashMap<UUID,Map<String,Object>>();for(var p:repo.list("workplace",owner()))map.put((UUID)p.get("id"),p);return map;}
 @Transactional(readOnly=true) public List<Map<String,Object>> templates(){var places=workplaceMap();var out=new ArrayList<>(repo.list("template",owner()).stream().filter(r->!OFF_TEMPLATE_ID.equals(r.get("id"))).map(r->templateResponse(r,places)).toList());out.add(offTemplate());return out;}
 @Transactional(readOnly=true) public Map<String,Object> template(UUID id){if(OFF_TEMPLATE_ID.equals(id))return offTemplate();var row=repo.find("template",owner(),id);if(row==null)throw new ResourceNotFoundException("템플릿을 찾을 수 없습니다.");return templateResponse(row,workplaceMap());}
 @Transactional(readOnly=true) public Map<String,Object> record(UUID id){var row=repo.find("work",owner(),id);if(row==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");return workResponse(row,repo.payments(owner()));}
 @SuppressWarnings("unchecked") public Map<String,Object> saveTemplate(UUID id,TemplateInput in){
  require(in!=null,"템플릿을 입력하세요.");require(!OFF_TEMPLATE_ID.equals(id),"기본 휴무 템플릿은 수정할 수 없습니다.");repo.lock(owner());var old=repo.find("template",owner(),id);String hash=hash(in);
  if(replay(old,in.expectedVersion(),hash))return template(id);check("template",id,old,in.expectedVersion());
  text(in.name(),120,true,"템플릿 이름");text(in.shiftDescription(),240,false,"시간대 설명");text(in.groupName(),120,false,"근무조");timing(in.startTime(),in.endTime(),in.overnight(),in.breakMinutes(),in.durationMinutes(),true);
  require(in.active()!=null,"템플릿 상태를 입력하세요.");
  UUID placeId=in.workplaceId()!=null?in.workplaceId():old!=null?workplaceId(old):MoneyCalendarRepository.defaultWorkplaceId(owner());
  if(placeId.equals(MoneyCalendarRepository.defaultWorkplaceId(owner())))repo.ensureDefaultWorkplace(owner());var place=workplace(placeId);
  require(!Boolean.TRUE.equals(in.active())||Boolean.TRUE.equals(place.get("active"))||old!=null&&workplaceId(old).equals(placeId),"보관된 근무지에 새 템플릿을 만들 수 없습니다.");
  // Legacy template-local writes are bridged to this workplace's canonical catalog.
  if(in.workplaceId()==null){validatePresets(in.presets());var merged=new LinkedHashMap<String,Preset>();for(var p:presets(place))merged.put(p.get("id").toString(),json.convertValue(p,Preset.class));
   if(old!=null)for(var p:(List<Map<String,Object>>)old.getOrDefault("presets",List.of()))require(in.presets().stream().anyMatch(n->n.id().toString().equals(p.get("id").toString())),"기존 프리셋은 삭제 대신 보관하세요.");
   for(var p:in.presets())merged.put(p.id().toString(),p);saveWorkplace(placeId,new WorkplaceInput(version(place),place.get("name").toString(),Boolean.TRUE.equals(place.get("active")),new ArrayList<>(merged.values())),id);place=workplace(placeId);
   if(old!=null)old=repo.find("template",owner(),id);
  }
  UUID defaultId=in.defaultPresetId();boolean moved=old!=null&&!workplaceId(old).equals(placeId);
  final UUID desired=defaultId;boolean validDefault=presets(place).stream().anyMatch(p->Boolean.TRUE.equals(p.get("active"))&&p.get("id").toString().equals(Objects.toString(desired,"")));
  if(moved&&!validDefault)defaultId=null;else require(defaultId==null||validDefault,"기본 프리셋은 같은 근무지의 활성 프리셋이어야 합니다.");
  var value=data(in);value.remove("expectedVersion");value.put("workplaceId",placeId.toString());value.put("defaultPresetId",defaultId==null?null:defaultId.toString());value.put("presets",presets(place));repo.save("template",owner(),id,value,old==null?1:version(old)+1,hash,null,old==null);return template(id);
 }
 public Map<String,Object> saveWork(UUID id,WorkInput in){return saveWork(id,in,null);}
 public Map<String,Object> saveEarnings(UUID id,EarningsInput in){
  require(in!=null&&in.workDate()!=null,"근무 날짜를 입력하세요.");require(in.contractVersion()==null||in.contractVersion()==4,"지원하지 않는 근무 계약 버전입니다.");
  if(scheduleContract(in))require(in.basePay()==null&&in.totalDeduction()==null&&(in.saveAsPresetName()==null||in.saveAsPresetName().isBlank()),"최신 편집기는 직접 일급과 통합 템플릿 관리를 사용하세요.");
  else require(in.receiptConfirmed()==null&&in.selectedTemplateVersion()==null&&!Boolean.TRUE.equals(in.reselectPreset()),"최신 근무 계약 버전 4가 필요합니다.");repo.lock(owner());var old=repo.find("work",owner(),id);Long pay=earningsPay(in,old);
  if(Set.of("OFF","CANCELLED").contains(in.status()==null?"":in.status()))require((pay==null||pay==0)&&in.dailyIncentive()==0&&(directEarnings(in)||in.basePay()==0&&in.totalDeduction()==0),"휴무·취소로 바꾸려면 급여와 인센을 명시적으로 0원으로 저장하세요. 이전 값은 이력에 보관됩니다.");
  long legacyExpected=old==null?0:number(old.get("expectedAmount"));if("CANCELLED".equals(in.status()))legacyExpected=0;
  var work=new WorkInput(in.expectedVersion(),in.workDate(),in.status(),in.templateId(),in.presetId(),in.startTime(),in.endTime(),in.overnight(),in.breakMinutes(),in.durationMinutes(),legacyExpected,in.memo(),null,in.saveAsPresetName());
  saveWork(id,work,in);return earningsRecord(id);
 }
 @SuppressWarnings("unchecked") private Map<String,Object> saveWork(UUID id,WorkInput in,EarningsInput earnings){
  require(in!=null&&in.workDate()!=null,"근무 날짜를 입력하세요.");repo.lock(owner());var old=repo.find("work",owner(),id);String hash=earnings==null?hash(in):earningsHash(earnings);
  if(earnings==null&&old!=null&&confirmedModel(old))throw new OptimisticLockConflictException("확정 일당 기록은 최신 급여 편집기에서 수정하세요. 기존 입력은 보존되었습니다.");
  if(replay(old,in.expectedVersion(),hash))return workResponse(old,repo.payments(owner()));check("work",id,old,in.expectedVersion());
  if(old!=null&&number(old.get("contractVersion"))>=4&&(earnings==null||!scheduleContract(earnings)))throw new OptimisticLockConflictException("일정·입금 확인을 보존하려면 최신 근무 편집기를 사용하세요.");
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
   if(old==null&&repo.offDateOccupied(owner(),in.workDate(),id))throw new OptimisticLockConflictException("기존 휴무 기록을 복원하거나 해당 날짜에 근무를 추가하세요.");
   if(old!=null&&!"OFF".equals(old.get("status"))){var history=new ArrayList<>((List<Map<String,Object>>)old.getOrDefault("offTransitionHistory",List.of()));history.add(transitionSnapshot(old));value.put("offTransitionHistory",history);}
   value.put("templateId",null);value.put("presetId",null);value.put("templateName","휴무");value.put("presetName","휴무");value.put("presetAmount",0);value.put("templateSnapshot",offTemplate());value.put("startTime",null);value.put("endTime",null);value.put("overnight",false);value.put("breakMinutes",0);value.put("durationMinutes",0);value.put("expectedAmount",0);
  }
  else if(same&&!(earnings!=null&&scheduleContract(earnings)&&Boolean.TRUE.equals(earnings.reselectPreset()))){for(String field:List.of("templateName","presetName","presetAmount","templateSnapshot","selectedTemplateVersion","expectedSnapshot"))if(old.containsKey(field))value.put(field,old.get(field));}
  else if(in.templateId()!=null){
   selectedTemplate=repo.find("template",owner(),in.templateId());if(selectedTemplate==null)throw new ResourceNotFoundException("템플릿을 찾을 수 없습니다.");require(Boolean.TRUE.equals(selectedTemplate.get("active")),"비활성 템플릿은 새로 선택할 수 없습니다.");
   var selectedPlace=workplace(workplaceId(selectedTemplate));require(Boolean.TRUE.equals(selectedPlace.get("active")),"보관된 근무지는 새로 선택할 수 없습니다.");
   if(earnings!=null&&scheduleContract(earnings)&&(earnings.selectedTemplateVersion()==null||earnings.selectedTemplateVersion()!=version(selectedTemplate)))throw new OptimisticLockConflictException("선택한 프리셋이 변경되었습니다. 초안을 보존하고 템플릿과 프리셋을 다시 선택하세요.");
   var preset=presets(selectedPlace).stream().filter(p->Objects.equals(p.get("id"),in.presetId()==null?null:in.presetId().toString())).findFirst().orElseThrow(()->new InvalidRequestException("같은 근무지의 프리셋을 선택하세요."));require(Boolean.TRUE.equals(preset.get("active")),"비활성 프리셋은 새로 선택할 수 없습니다.");
   value.put("templateName",selectedTemplate.get("name"));value.put("presetName",preset.get("name"));value.put("presetAmount",preset.get("amount"));value.put("templateSnapshot",clean(selectedTemplate));
   if(earnings!=null&&scheduleContract(earnings)){value.put("expectedAmount",preset.get("amount"));value.put("selectedTemplateVersion",version(selectedTemplate));value.put("expectedSnapshot",Map.of("templateId",in.templateId().toString(),"templateName",selectedTemplate.get("name"),"presetId",in.presetId().toString(),"presetName",preset.get("name"),"amount",preset.get("amount"),"templateVersion",version(selectedTemplate)));}
  }
  var paymentIds=new HashSet<UUID>();if(in.payments()!=null)for(var p:in.payments()){require(p!=null&&p.id()!=null&&paymentIds.add(p.id()),"입금 식별자가 중복되었습니다.");amount(p.amount(),false);require(in.status().equals("COMPLETED")&&p.amount()>0&&p.depositDate()!=null&&!p.depositDate().isBefore(in.workDate())&&!p.depositDate().isAfter(today),"입금은 완료 근무일 이후부터 오늘까지의 양수 금액이어야 합니다.");}
  // Date is a grouping key, never record identity. Existing UUID/version replay protects retries.
  if(in.payments()!=null)repo.validatePayments(owner(),id,in.payments());
  UUID recordPlace=old!=null?workplaceId(old):MoneyCalendarRepository.defaultWorkplaceId(owner());
  if(working&&(!same||earnings!=null&&Boolean.TRUE.equals(earnings.reselectPreset())))recordPlace=workplaceId(selectedTemplate!=null?selectedTemplate:repo.find("template",owner(),in.templateId()));
  if(recordPlace.equals(MoneyCalendarRepository.defaultWorkplaceId(owner())))repo.ensureDefaultWorkplace(owner());
  value.put("workplaceId",recordPlace.toString());value.put("workplaceName",old!=null&&workplaceId(old).equals(recordPlace)?old.getOrDefault("workplaceName",workplace(recordPlace).get("name")):workplace(recordPlace).get("name"));
  if(in.saveAsPresetName()!=null&&!in.saveAsPresetName().isBlank()){
   text(in.saveAsPresetName(),120,true,"새 프리셋 이름");require(working&&in.templateId()!=null,"근무 템플릿을 선택하세요.");if(selectedTemplate==null)selectedTemplate=repo.find("template",owner(),in.templateId());require(selectedTemplate!=null&&Boolean.TRUE.equals(selectedTemplate.get("active")),"활성 템플릿을 선택하세요.");
   var place=workplace(workplaceId(selectedTemplate));var presets=new ArrayList<>(presets(place));require(presets.size()<100,"프리셋은 100개까지 저장할 수 있습니다.");var presetId=UUID.randomUUID();long presetAmount=earnings==null?in.expectedAmount():!directEarnings(earnings)?earnings.basePay():number(value.get("presetAmount"));presets.add(Map.of("id",presetId.toString(),"name",in.saveAsPresetName(),"amount",presetAmount,"active",true));
   saveWorkplace((UUID)place.get("id"),new WorkplaceInput(version(place),place.get("name").toString(),Boolean.TRUE.equals(place.get("active")),presets.stream().map(p->json.convertValue(p,Preset.class)).toList()),in.templateId());
   var updated=clean(selectedTemplate);updated.remove("id");updated.remove("version");updated.put("presets",presets);repo.save("template",owner(),in.templateId(),updated,version(selectedTemplate)+1,hash,null,false);
   value.put("presetId",presetId.toString());value.put("presetName",in.saveAsPresetName());value.put("presetAmount",presetAmount);
  }
  if(earnings!=null){
   if(old!=null&&confirmedModel(old)&&((working(old)&&"CANCELLED".equals(in.status()))||(directEarnings(earnings)&&"CONFIRMED_V2".equals(old.get("wageModel"))&&!preserveV2(earnings,old))||(scheduleContract(earnings)&&(((old.get("confirmedDailyPay")==null)!=(earningsPay(earnings,old)==null)||number(old.get("confirmedDailyPay"))!=number(earningsPay(earnings,old)))||number(old.get("dailyIncentive"))!=number(earnings.dailyIncentive()))))){var history=new ArrayList<>((List<Map<String,Object>>)old.getOrDefault("earningsTransitionHistory",List.of()));history.add(transitionSnapshot(old));value.put("earningsTransitionHistory",history);}
   if(old!=null&&old.containsKey("legacyWageSnapshot"))value.put("legacyWageSnapshot",old.get("legacyWageSnapshot"));
   else if(old!=null&&!confirmedModel(old)){var snapshot=clean(old);snapshot.put("sourceUpdatedAt",repo.workUpdatedAt(owner(),id));value.put("legacyWageSnapshot",snapshot);}
   if(preserveV2(earnings,old)){for(String f:List.of("wageModel","basePay","totalDeduction"))value.put(f,old.get(f));}
   else if(!directEarnings(earnings)){value.put("wageModel","CONFIRMED_V2");value.put("basePay",earnings.basePay());value.put("totalDeduction",earnings.totalDeduction());}
   else{value.put("wageModel","CONFIRMED_DIRECT_V3");for(String f:List.of("basePay","totalDeduction"))if(old!=null&&old.containsKey(f))value.put(f,old.get(f));}
   value.put("dailyIncentive",earnings.dailyIncentive());value.put("confirmedDailyPay",earningsPay(earnings,old));
   if(scheduleContract(earnings)){value.put("contractVersion",4);applyReceipt(old,value,earnings.receiptConfirmed(),old==null?1:version(old)+1);}
  }
  repo.save("work",owner(),id,value,old==null?1:version(old)+1,hash,in.workDate(),old==null);if(in.payments()!=null)repo.payments(owner(),id,in.payments());return workResponse(repo.find("work",owner(),id),repo.payments(owner()));
 }
 public Map<String,Object> removeOff(UUID id,RemoveOffInput in){
  require(in!=null,"기록 버전이 필요합니다.");repo.lock(owner());var old=repo.find("work",owner(),id);if(old==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");String hash=hash(List.of("remove-off",in));
  if(replay(old,in.expectedVersion(),hash))return workResponse(old,repo.payments(owner()));check("work",id,old,in.expectedVersion());require("OFF".equals(old.get("status")),"휴무 기록만 제거할 수 있습니다.");
  if(confirmedModel(old))require(number(old.get("dailyIncentive"))==0&&number(old.get("confirmedDailyPay"))==0&&(!"CONFIRMED_V2".equals(old.get("wageModel"))||number(old.get("basePay"))==0&&number(old.get("totalDeduction"))==0),"금액이 있는 확정 일당 기록은 먼저 명시적으로 정정하세요.");
  var value=clean(old);value.remove("id");value.remove("version");value.put("removed",true);repo.save("work",owner(),id,value,version(old)+1,hash,LocalDate.parse(old.get("workDate").toString()),false);return workResponse(repo.find("work",owner(),id),repo.payments(owner()));
 }
 private Map<String,Object> workResponse(Map<String,Object> row,List<Map<String,Object>> payments){var out=clean(row);var historic=payments.stream().filter(p->p.get("workRecordId").equals(row.get("id"))).toList();out.put("payments",historic);out.put("legacyPaymentsReadOnly",!historic.isEmpty());out.putIfAbsent("receiptConfirmation",Map.of("confirmed",false,"amount",0L,"revision",0L));out.putIfAbsent("receiptConfirmationHistory",List.of());out.put("receiptConfirmed",receiptAmount(row)>0);out.put("receiptConfirmedAmount",receiptAmount(row));return out;}
 @SuppressWarnings("unchecked") private static long receiptAmount(Map<String,Object> row){if(!working(row)||!"COMPLETED".equals(row.get("status")))return 0;var state=(Map<String,Object>)row.get("receiptConfirmation");return state!=null&&Boolean.TRUE.equals(state.get("confirmed"))?number(state.get("amount")):0;}
 /** Date-free confirmation evidence, separate from immutable legacy deposit rows. */
 @SuppressWarnings("unchecked") private void applyReceipt(Map<String,Object> old,Map<String,Object> value,Boolean action,long workVersion){
  var prior=old==null?null:(Map<String,Object>)old.get("receiptConfirmation");boolean wasConfirmed=prior!=null&&Boolean.TRUE.equals(prior.get("confirmed"));boolean confirmed=action==null?wasConfirmed:action;
  long pay=number(value.get("confirmedDailyPay"));require(!confirmed||"COMPLETED".equals(value.get("status"))&&value.get("confirmedDailyPay") instanceof Number&&pay>0,"입금 완료는 양수 확정 일급이 있는 완료 근무만 저장할 수 있습니다. 상태와 일급을 확인하세요.");
  long amount=confirmed?pay:0;var history=new ArrayList<Map<String,Object>>(old==null?List.of():(List<Map<String,Object>>)old.getOrDefault("receiptConfirmationHistory",List.of()));
  if(prior==null&&action==null){value.put("receiptConfirmationHistory",history);return;}
  if(prior!=null&&wasConfirmed==confirmed&&number(prior.get("amount"))==amount)value.put("receiptConfirmation",prior);
  else {if(prior!=null)history.add(new LinkedHashMap<>(prior));value.put("receiptConfirmation",Map.of("confirmed",confirmed,"amount",amount,"revision",prior==null?1:number(prior.get("revision"))+1,"workVersion",workVersion));}
  value.put("receiptConfirmationHistory",history);
 }
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
 private static boolean scheduleContract(EarningsInput in){return Integer.valueOf(4).equals(in.contractVersion());}
 private static boolean directEarnings(EarningsInput in){return scheduleContract(in)||in.confirmedDailyPay()!=null&&in.basePay()==null&&in.totalDeduction()==null;}
 private static boolean preserveV2(EarningsInput in,Map<String,Object> old){return scheduleContract(in)&&old!=null&&"CONFIRMED_V2".equals(old.get("wageModel"))&&confirmedEarnings(old)&&in.confirmedDailyPay()!=null&&in.dailyIncentive()!=null&&in.confirmedDailyPay()==number(old.get("confirmedDailyPay"))&&in.dailyIncentive()==number(old.get("dailyIncentive"));}
 private static Long earningsPay(EarningsInput in,Map<String,Object> old){if(preserveV2(in,old))return number(old.get("confirmedDailyPay"));return earningsPay(in);}
 private static Long earningsPay(EarningsInput in){if(scheduleContract(in)&&in.confirmedDailyPay()==null){require(Long.valueOf(0).equals(in.dailyIncentive()),"미확정 일급의 포함 인센티브는 0원이어야 합니다.");return null;}return !directEarnings(in)?confirmedDailyPay(in.basePay(),in.dailyIncentive(),in.totalDeduction()):directDailyPay(in.confirmedDailyPay(),in.dailyIncentive());}
 private String earningsHash(EarningsInput in){var payload=data(in);if(!scheduleContract(in))for(String f:List.of("contractVersion","selectedTemplateVersion","reselectPreset","receiptConfirmed"))payload.remove(f);if(!directEarnings(in))payload.remove("confirmedDailyPay");return hash(List.of(!directEarnings(in)?"CONFIRMED_V2":"CONFIRMED_DIRECT_V3",payload));}
 private static boolean confirmedModel(Map<String,Object> row){return "CONFIRMED_V2".equals(row.get("wageModel"))||"CONFIRMED_DIRECT_V3".equals(row.get("wageModel"));}
 static boolean legacyReviewRequired(Map<String,Object> row,LocalDate today){if(!working(row)||confirmedEarnings(row))return false;var day=LocalDate.parse(row.get("workDate").toString());return day.isBefore(today)||day.equals(today)&&"COMPLETED".equals(row.get("status"));}
 private static boolean legacyReviewRequired(Map<String,Object> row){return legacyReviewRequired(row,LocalDate.now(ZoneId.of("Asia/Seoul")));}
 private Map<String,Object> earningsResponse(Map<String,Object> row,List<Map<String,Object>> payments){var out=workResponse(row,payments);boolean confirmed=confirmedEarnings(row);out.put("wageCompatibility",confirmed?row.get("wageModel"):legacyReviewRequired(row)?"LEGACY_REVIEW_REQUIRED":"NOT_APPLICABLE");if(!confirmed)for(String f:List.of("basePay","dailyIncentive","totalDeduction","confirmedDailyPay"))out.put(f,null);if(number(row.get("contractVersion"))>=4&&!confirmed)out.put("dailyIncentive",0L);return out;}
 @Transactional(readOnly=true) public Map<String,Object> earningsRecord(UUID id){var row=repo.find("work",owner(),id);if(row==null)throw new ResourceNotFoundException("근무 기록을 찾을 수 없습니다.");return earningsResponse(row,repo.payments(owner()));}
 @Transactional(readOnly=true) public Map<String,Object> earningsCalendar(String month){return earningsCalendar(month,null,"ALL");}
 @Transactional(readOnly=true) public Map<String,Object> earningsCalendar(String month,UUID placeId,String status){
  require(Set.of("ALL","SCHEDULED","COMPLETED","OFF","CANCELLED").contains(status),"근무 상태를 확인하세요.");
  if(placeId!=null)workplace(placeId);
  var selected=YearMonth.parse(month);var grid=visibleRange(month);var unfiltered=repo.list("work",owner());var all=unfiltered.stream().filter(r->placeId==null||workplaceId(r).equals(placeId)).filter(r->status.equals("ALL")||status.equals(r.get("status"))).toList();var payments=repo.payments(owner());var places=workplaceMap();var savedWeeks=repo.earningsWeeks(owner());var visible=all.stream().filter(r->between(r.get("workDate"),grid[0],grid[1])).toList();var nominal=all.stream().filter(MoneyCalendarService::working).filter(r->between(r.get("workDate"),selected.atDay(1),selected.atEndOfMonth())).toList();var confirmed=nominal.stream().filter(MoneyCalendarService::confirmedEarnings).toList();var legacy=nominal.stream().filter(MoneyCalendarService::legacyReviewRequired).toList();
  var summary=new LinkedHashMap<String,Object>();summary.put("baseTotal",confirmed.stream().mapToLong(r->number(r.get("basePay"))).sum());summary.put("incentiveTotal",confirmed.stream().mapToLong(r->number(r.get("dailyIncentive"))).sum());summary.put("deductionTotal",confirmed.stream().mapToLong(r->number(r.get("totalDeduction"))).sum());summary.put("confirmedDailyPay",confirmed.stream().mapToLong(r->number(r.get("confirmedDailyPay"))).sum());summary.put("workdays",(int)nominal.stream().map(r->r.get("workDate")).distinct().count());summary.put("workMinutes",nominal.stream().mapToLong(r->number(r.get("durationMinutes"))).sum());summary.put("legacyReviewCount",legacy.size());summary.put("legacyRecordedAmount",legacy.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());
  var weeks=new ArrayList<Map<String,Object>>();for(var d=grid[0];!d.isAfter(grid[1]);d=d.plusWeeks(1))weeks.add(aggregateEarningsWeek(d,all,places,savedWeeks,placeId,status));
  summary.put("expectedAmount",nominal.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());summary.put("receiptConfirmedAmount",nominal.stream().mapToLong(MoneyCalendarService::receiptAmount).sum());summary.put("receiptAggregationBasis","WORK_DATE");summary.put("scheduledAmount",nominal.stream().filter(r->"SCHEDULED".equals(r.get("status"))&&!LocalDate.parse(r.get("workDate").toString()).isBefore(LocalDate.now(ZoneId.of("Asia/Seoul")))).mapToLong(r->number(r.get("expectedAmount"))).sum());summary.put("scheduledWorkdays",nominal.stream().filter(r->"SCHEDULED".equals(r.get("status"))).map(r->r.get("workDate")).distinct().count());summary.put("completedWorkdays",nominal.stream().filter(r->"COMPLETED".equals(r.get("status"))).map(r->r.get("workDate")).distinct().count());summary.put("completedMinutes",nominal.stream().filter(r->"COMPLETED".equals(r.get("status"))).mapToLong(r->number(r.get("durationMinutes"))).sum());
  var legacyStarts=new TreeSet<LocalDate>();for(String d:repo.payWeekStarts(owner()))legacyStarts.add(LocalDate.parse(d));for(var r:all)if(working(r))legacyStarts.add(LocalDate.parse(r.get("workDate").toString()).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY)));
  var historical=new ArrayList<Map<String,Object>>();for(var d:legacyStarts){var saved=repo.payWeek(owner(),d);var old=payWeekResponse(d,saved,all);if(saved!=null||number(old.get("totalPay"))>0){old.put("readOnly",true);old.put("wageCompatibility","LEGACY_REVIEW_REQUIRED");historical.add(old);}}
  var result=new LinkedHashMap<String,Object>();result.put("gridStart",grid[0].toString());result.put("gridEnd",grid[1].toString());result.put("records",visible.stream().filter(MoneyCalendarService::active).map(r->earningsResponse(r,payments)).toList());result.put("allRecords",unfiltered.stream().filter(MoneyCalendarService::active).filter(r->between(r.get("workDate"),grid[0].minusDays(1),grid[1].plusDays(1))).map(r->earningsResponse(r,payments)).toList());result.put("archivedRecords",unfiltered.stream().filter(r->!active(r)).filter(r->between(r.get("workDate"),grid[0],grid[1])).map(r->earningsResponse(r,payments)).toList());result.put("summary",summary);result.put("weeks",weeks);result.put("legacyWeeks",historical);result.put("legacyDepositWeeks",payCalendar(month).get("legacyWeeks"));return result;
 }
 @Transactional(readOnly=true) public Map<String,Object> earningsWeek(LocalDate start){sunday(start);return aggregateEarningsWeek(start,repo.list("work",owner()),workplaceMap(),repo.earningsWeeks(owner()),null,"ALL");}
 @Transactional(readOnly=true) public Map<String,Object> earningsWeek(LocalDate start,UUID placeId){sunday(start);workplace(placeId);var records=repo.list("work",owner()).stream().filter(r->workplaceId(r).equals(placeId)).toList();var out=earningsWeekResponse(start,repo.earningsWeek(owner(),start,placeId),records);out.put("workplaceId",placeId.toString());return out;}
 private Map<String,Object> aggregateEarningsWeek(LocalDate start,List<Map<String,Object>> all,Map<UUID,Map<String,Object>> places,List<Map<String,Object>> savedWeeks,UUID selected,String status){
  var parts=new ArrayList<Map<String,Object>>();
  for(var place:places.values())if(selected==null||place.get("id").equals(selected)){
   UUID id=(UUID)place.get("id");var records=all.stream().filter(r->workplaceId(r).equals(id)).toList();
   var saved=savedWeeks.stream().filter(w->workplaceId(w).equals(id)&&start.toString().equals(w.get("weekStart"))).findFirst().orElse(null);
   // week_start is relational in legacy rows; repository exposes it without rewriting JSON.
   if(!status.equals("ALL")&&!status.equals("COMPLETED"))saved=null;
   var part=earningsWeekResponse(start,saved,records);part.put("workplaceId",id.toString());part.put("workplaceName",place.get("name"));parts.add(part);
  }
  var out=earningsWeekResponse(start,null,all);for(String key:List.of("specialWorkAllowance","weeklyHolidayAllowance","finalPay"))out.put(key,parts.stream().mapToLong(p->number(p.get(key))).sum());
  var legacy=parts.stream().filter(p->p.get("workplaceId").equals(MoneyCalendarRepository.defaultWorkplaceId(owner()).toString())).findFirst();out.put("version",legacy.map(p->p.get("version")).orElse(0L));out.put("workplaceBreakdowns",parts);out.put("readOnly",parts.size()>1);return out;
 }
 private Map<String,Object> earningsWeekResponse(LocalDate start,Map<String,Object> saved,List<Map<String,Object>> all){
  var entries=all.stream().filter(MoneyCalendarService::working).filter(r->between(r.get("workDate"),start,start.plusDays(6))).sorted(Comparator.comparing(r->r.get("id").toString())).toList();var confirmed=entries.stream().filter(MoneyCalendarService::confirmedEarnings).toList();
  long base=confirmed.stream().mapToLong(r->number(r.get("basePay"))).sum(),incentive=confirmed.stream().mapToLong(r->number(r.get("dailyIncentive"))).sum(),deduction=confirmed.stream().mapToLong(r->number(r.get("totalDeduction"))).sum(),daily=confirmed.stream().mapToLong(r->number(r.get("confirmedDailyPay"))).sum();
  var out=saved==null?new LinkedHashMap<String,Object>():new LinkedHashMap<>(clean(saved));long special=number(out.get("specialWorkAllowance")),rest=number(out.get("weeklyHolidayAllowance"));out.put("specialWorkAllowance",special);out.put("weeklyHolidayAllowance",rest);out.put("start",start.toString());out.put("end",start.plusDays(6).toString());out.put("version",saved==null?0L:version(saved));out.put("baseTotal",base);out.put("incentiveTotal",incentive);out.put("deductionTotal",deduction);out.put("dailyTotal",daily);out.put("finalPay",daily+special+rest);out.put("aggregationBasis","CONFIRMED_DAILY_V2");
  var legacy=entries.stream().filter(MoneyCalendarService::legacyReviewRequired).toList();out.put("legacyReviewCount",legacy.size());out.put("legacyRecordedAmount",legacy.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());out.put("workEntries",confirmed.stream().map(this::clean).toList());out.put("legacyEntries",legacy.stream().map(this::clean).toList());
  out.put("expectedAmount",entries.stream().mapToLong(r->number(r.get("expectedAmount"))).sum());out.put("receiptConfirmedAmount",entries.stream().mapToLong(MoneyCalendarService::receiptAmount).sum());out.put("receiptAggregationBasis","WORK_DATE");
  var facts=entries.stream().map(r->{var fact=new LinkedHashMap<String,Object>();for(String f:List.of("id","version","workDate","status","wageModel","basePay","dailyIncentive","totalDeduction","confirmedDailyPay"))fact.put(f,r.get(f));return fact;}).toList();out.put("dailyFingerprint",hash(facts));return out;
 }
 public Map<String,Object> saveEarningsWeek(LocalDate start,EarningsWeekInput in){return saveEarningsWeek(start,in,null);}
 public Map<String,Object> saveEarningsWeek(LocalDate start,EarningsWeekInput in,UUID selected){
  UUID placeId=selected==null?MoneyCalendarRepository.defaultWorkplaceId(owner()):selected;
  if(selected!=null)workplace(placeId);else repo.ensureDefaultWorkplace(owner());
  sunday(start);require(in!=null,"주간 수당을 입력하세요.");amount(in.specialWorkAllowance(),false);amount(in.weeklyHolidayAllowance(),false);repo.lock(owner());var old=repo.earningsWeek(owner(),start,placeId);UUID id=old==null?UUID.randomUUID():(UUID)old.get("id");String hash=hash(in);if(replay(old,in.expectedVersion(),hash))return selected==null?earningsWeek(start):earningsWeek(start,placeId);check("earningsWeek",id,old,in.expectedVersion());
  if(!Objects.equals(in.expectedDailyFingerprint(),(selected==null?earningsWeek(start):earningsWeek(start,placeId)).get("dailyFingerprint")))throw new OptimisticLockConflictException("일별 급여 구성이 변경되었습니다. 초안을 보존하고 다시 불러오세요.");
  var value=data(in);value.remove("expectedVersion");value.remove("expectedDailyFingerprint");value.put("workplaceId",placeId.toString());repo.save("earningsWeek",owner(),id,value,old==null?1:version(old)+1,hash,start,old==null);return selected==null?earningsWeek(start):earningsWeek(start,placeId);
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
