package com.kafka.backend.money;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static com.kafka.backend.money.MoneyService.*;
import static com.kafka.backend.money.MoneyProductService.*;

/** Category identity and hierarchy only; never writes financial facts or meaning references. */
final class MoneyCategories {
 private final JdbcTemplate db; private final UUID owner; private final ObjectMapper json;
 MoneyCategories(JdbcTemplate db,UUID owner,ObjectMapper json){this.db=db;this.owner=owner;this.json=json;}
 static final String ACTIVE="not c.archived and not coalesce(p.archived,false)";
 List<Category> list(){return db.query("select c.*,not ("+ACTIVE+") effective_archived from money_categories c left join money_categories p on p.id=c.parent_id and p.user_id=c.user_id where c.user_id=? order by c.kind,c.sort_order,c.name,c.id",(r,n)->new Category(r.getObject("id",UUID.class),r.getString("name"),r.getString("color"),r.getBoolean("archived"),r.getLong("version"),r.getString("kind"),r.getString("emoji"),r.getInt("sort_order"),r.getBoolean("seeded"),r.getObject("parent_id",UUID.class),r.getBoolean("effective_archived"),r.getObject("structural_group_id",UUID.class),r.getString("icon_type")==null?(r.getString("emoji")==null?null:"EMOJI"):r.getString("icon_type"),r.getString("icon_type")==null?r.getString("emoji"):r.getString("icon_value")),owner);}
 Category get(UUID id){return list().stream().filter(c->c.id().equals(id)).findFirst().orElseThrow(()->new ResourceNotFoundException("Category not found"));}
 private void version(long actual,Long expected){if(expected==null||actual!=expected)throw new OptimisticLockConflictException("카테고리가 변경되었습니다. 다시 확인하세요.");}
 private void audit(UUID id,String action,Object before,Object after){db.update("insert into money_meaning_audit(id,user_id,subject_id,action,previous_value,next_value) values(?,?,?, ?,cast(? as jsonb),cast(? as jsonb))",UUID.randomUUID(),owner,id,action,json.writeValueAsString(before),json.writeValueAsString(after));}
 Category save(UUID id,CategoryInput v){
  require(v!=null,"Category required");text(v.name(),80,true,"Name");require(!v.name().strip().equals("세부분류 없음"),"세부분류 없음은 가상 필터입니다.");
  require(v.color()!=null&&v.color().matches("#[0-9a-fA-F]{6}"),"Invalid color");text(v.emoji(),32,false,"Emoji");require(v.sortOrder()==null||v.sortOrder()>=0,"Invalid order");
  Category old=id==null?null:get(id);String kind=v.kind()==null?(old==null?"EXPENSE":old.kind()):v.kind();
  require(Set.of("EXPENSE","INCOME").contains(kind),"Category kind required");
  UUID parent=old==null?v.parentId():old.parentId();
  if(old!=null){version(old.version(),v.expectedVersion());require(old.kind().equals(kind),"Category kind is immutable");require(v.parentId()==null||Objects.equals(v.parentId(),parent),"Use the confirmed move action");}
  if(parent!=null){var p=get(parent);require(p.parentId()==null&&p.kind().equals(kind),"Owned same-kind root required");}
  if(old!=null&&old.parentId()==null&&!old.archived()&&v.archived()&&list().stream().anyMatch(c->old.id().equals(c.parentId())))require(Boolean.TRUE.equals(v.confirmDeactivate()),"하위 분류 비활성 영향을 확인하세요.");
  require(list().stream().noneMatch(c->!c.id().equals(id)&&c.kind().equals(kind)&&Objects.equals(c.parentId(),parent)&&c.name().equals(v.name().strip())),"같은 위치에 같은 이름이 있습니다.");
  UUID key=id==null?UUID.randomUUID():id;int order=v.sortOrder()==null?(old==null?0:old.sortOrder()):v.sortOrder();
  if(old==null)db.update("insert into money_categories(id,user_id,name,color,kind,emoji,sort_order,parent_id,archived) values(?,?,?,?,?,?,?,?,?)",key,owner,v.name().strip(),v.color(),kind,v.emoji(),order,parent,v.archived());
  else db.update("update money_categories set name=?,color=?,emoji=?,sort_order=?,archived=?,version=version+1 where user_id=? and id=?",v.name().strip(),v.color(),v.kind()==null&&v.emoji()==null?old.emoji():v.emoji(),order,v.archived(),owner,key);
  var icon=MoneyCategoryIcons.normalize(v.iconType(),v.iconValue(),v.emoji());
  if(v.iconType()!=null||v.emoji()!=null||old==null)db.update("update money_categories set icon_type=?,icon_value=?,emoji=? where user_id=? and id=?",icon.type(),icon.value(),"EMOJI".equals(icon.type())?icon.value():null,owner,key);
  var next=get(key);audit(key,"CATEGORY_SAVE",old,next);return next;
 }
 record Impact(UUID id,UUID parentId,long version,long records,long rules,long children,long personalization,long drafts,String referenceFingerprint){}
 Impact impact(UUID id){var c=get(id);
  // Union by transaction identity avoids double-counting source + override + projection.
  long records=db.queryForObject("select count(*) from (select id from money_transactions where user_id=? and category_id=? union select transaction_id from money_bookkeeping_overrides where user_id=? and overrides->>'categoryId'=? union select transaction_id from money_rule_projections where user_id=? and defaults->>'categoryId'=? union select transaction_id from money_review_decisions where user_id=? and displayed->>'categoryId'=?) x",Long.class,owner,id,owner,id.toString(),owner,id.toString(),owner,id.toString());
  long rules=db.queryForObject("select count(*) from money_category_rules where user_id=? and category_id=?",Long.class,owner,id);
  long children=db.queryForObject("select count(*) from money_categories where user_id=? and parent_id=?",Long.class,owner,id);
  var references=db.queryForList("select transaction_id,version,decision_version,event_id from money_classification_state where user_id=? and category_id=? order by transaction_id",owner,id);var drafts=db.queryForList("select id,version from money_ai_rule_drafts where user_id=? and status='OPEN' and rule_input->>'categoryId'=? order by id",owner,id.toString());var live=db.queryForList("select id,version from money_transactions where user_id=? and category_id=? union all select transaction_id,version from money_bookkeeping_overrides where user_id=? and overrides->>'categoryId'=? union all select transaction_id,version from money_rule_projections where user_id=? and defaults->>'categoryId'=? order by id,version",owner,id,owner,id.toString(),owner,id.toString());var ruleVersions=db.queryForList("select id,version from money_category_rules where user_id=? and category_id=? order by id",owner,id);var childVersions=db.queryForList("select id,version from money_categories where user_id=? and parent_id=? order by id",owner,id);String fingerprint;try{fingerprint=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(Arrays.asList(references,drafts,live,ruleVersions,childVersions))));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}return new Impact(id,c.parentId(),c.version(),records,rules,children,references.size(),drafts.size(),fingerprint);
 }
 record Move(UUID parentId,Long expectedVersion,Long expectedParentVersion,Impact preview,boolean confirmed){}
 Category move(UUID id,Move input){require(input!=null&&input.confirmed()&&input.preview()!=null,"Preview and explicit confirmation required");var old=get(id);var parent=get(input.parentId());version(old.version(),input.expectedVersion());version(parent.version(),input.expectedParentVersion());
  require(old.parentId()!=null&&parent.parentId()==null&&old.kind().equals(parent.kind())&&!parent.effectiveArchived(),"Move child to an active same-kind parent");
  require(impact(id).equals(input.preview()),"영향이 변경되었습니다. 다시 미리보기 하세요.");
  require(list().stream().noneMatch(c->!c.id().equals(id)&&Objects.equals(c.parentId(),parent.id())&&c.name().equals(old.name())),"대상에 같은 이름이 있습니다.");
  db.update("update money_categories set parent_id=?,sort_order=(select coalesce(max(sort_order),-1)+1 from money_categories where user_id=? and parent_id=?),version=version+1 where user_id=? and id=?",parent.id(),owner,parent.id(),owner,id);var next=get(id);audit(id,"CATEGORY_MOVE",old,next);return next;
 }
 record Order(List<UUID> ids,Map<UUID,Long> versions){}
 List<Category> order(Order input){require(input!=null&&input.ids()!=null&&!input.ids().isEmpty()&&input.versions()!=null,"Order required");var all=list();var first=get(input.ids().getFirst());var siblings=all.stream().filter(c->c.kind().equals(first.kind())&&Objects.equals(c.parentId(),first.parentId())).toList();
  require(input.ids().size()==siblings.size()&&new HashSet<>(input.ids()).equals(new HashSet<>(siblings.stream().map(Category::id).toList())),"Include each sibling exactly once");
  for(var c:siblings)version(c.version(),input.versions().get(c.id()));
  for(int i=0;i<input.ids().size();i++)db.update("update money_categories set sort_order=?,version=version+1 where user_id=? and id=?",i,owner,input.ids().get(i));audit(first.id(),"CATEGORY_ORDER",siblings,input.ids());return list();
 }
 List<Category> defaults(){
  String[][] expense={{"식비","🍽️","식사","배달","장보기","카페·간식"},{"주거·생활","🏠","월세·관리비","생활용품","가구·가전"},{"교통","🚇","대중교통","택시","자동차"},{"쇼핑","🛍️","의류·패션","전자기기","일반 쇼핑"},{"건강·운동","💙","병원·약국","건강관리","운동"},{"교육·성장","📚","도서","강의·교육","학습·생산성 도구"},{"여가·문화","🎭","문화·공연","게임·콘텐츠","취미"},{"여행","✈️","숙박","이동","현지지출"},{"관계·경조","🎁","경조사","선물","모임"},{"업무","💼","업무비","업무 도구·서비스","업무 장비"},{"통신·구독","📱","통신비","디지털 구독","멤버십"},{"공과금","📄","전기·가스·수도","기타 공과금"},{"기타","•"}};
  String[][] income={{"근로소득","💼","급여","상여·인센티브","아르바이트·일용"},{"사업·프리랜스","🧑‍💻","프리랜스","사업수입","기타 용역수입"},{"금융소득","🌱","이자","배당"},{"지원·이전소득","🎁","지원금","용돈","증여·선물"},{"기타수입","•"}};
  var existing=new ArrayList<>(list());
  for(int k=0;k<2;k++){String kind=k==0?"EXPENSE":"INCOME";String[][] taxonomy=k==0?expense:income;
   for(int i=0;i<taxonomy.length;i++){var row=taxonomy[i];var parent=seed(existing,kind,null,row[0],row[1],i);for(int j=2;j<row.length;j++)seed(existing,kind,parent.id(),row[j],null,j-2);}}
  return list();
 }
 private Category seed(List<Category> existing,String kind,UUID parent,String name,String emoji,int order){
  var match=existing.stream().filter(c->c.kind().equals(kind)&&Objects.equals(c.parentId(),parent)&&c.name().equals(name)).findFirst();if(match.isPresent())return match.get();
  // A pre-existing flat/custom name elsewhere is preserved, never guessed or duplicated.
  require(existing.stream().noneMatch(c->c.kind().equals(kind)&&c.name().equals(name)),"기존 분류 '"+name+"'의 위치를 먼저 확인하세요. 자동 이동하지 않습니다.");
  var id=UUID.randomUUID();db.update("insert into money_categories(id,user_id,name,color,kind,emoji,sort_order,parent_id,seeded) values(?,?,?,?,?,?,?,?,true)",id,owner,name,kind.equals("EXPENSE")?"#D86F72":"#4FAF83",kind,emoji,order,parent);var c=new Category(id,name,kind.equals("EXPENSE")?"#D86F72":"#4FAF83",false,0,kind,emoji,order,true,parent,false);existing.add(c);return c;
 }
}
