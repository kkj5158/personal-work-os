package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.*;
import static com.kafka.backend.study.StudyValidation.*;
import static com.kafka.backend.study.StudyException.require;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.*;

/** Server-owned authoring steps. All mutations run under the existing owner/job transaction locks. */
final class StudyCampaign {
  static final String VERSION="study-engine-policy-v320", REVIEW="study-item-review-v320";
  static final int CALLS=40, TOKENS=400000;
  static boolean enabled(JsonNode p){return VERSION.equals(p.path("authoringPolicy").asString(""));}
  static ObjectNode state(StudyEngineJob j){return j.result==null?JSON.createObjectNode():object(j.result);}
  static void freeze(ObjectNode p, UUID owner,List<StudySourceExcerpt> spans,JsonNode controls){
    require(!spans.isEmpty() && spans.size()<=180 && spans.stream().allMatch(e->owner.equals(e.ownerId)));
    require(spans.stream().mapToInt(e->e.body.length()).sum()<=150000);
    var format=p.path("questionFormat");
    require(format.path("required").path("single_choice").asInt()==5 && format.path("required").path("essay").asInt()==1 && format.path("extension").path("case_analysis").asInt()==2);
    p.put("bundleScopeDigest",hash(owner+"/"+VERSION+"/"+p.path("sourceRanges")+"/"+spans.getFirst().sourceHash+"/"+spans.getFirst().materialVersion+"/"+spans.getFirst().parserVersion));
    var list=p.putArray("passages");
    for(var e:spans)list.add(excerpt(e));
    p.put("authoringPolicy",VERSION);
    if(controls.isString()){
      String raw=controls.asString();require(raw.length()<150000 && hash(raw).equals("5ac20b66f6c720b52de951456de1b429ffd44f1639cf7c1bd17f88184d091292"));
      var groups=p.putArray("controls");
      for(var g:JSON.readTree(raw).path("cases")){
        if(!Set.of("essay","single_choice").contains(g.path("type").asString()))continue;
        var c=groups.addObject().put("expected",g.path("label").asString().equals("approved_style")?"pass":"reject");
        var q=c.putObject("question");q.set("prompt",g.path("prompt"));q.set("kind",g.path("type"));if(g.has("options"))q.set("options",g.path("options"));
        var k=c.putObject("key");for(String[] map:new String[][]{{"modelAnswer","model"},{"answer","answer"},{"rationale","explanation"},{"hints","hints"},{"rubricCriteria","rubric"},{"distractorReasons","incorrectReasons"}})
          if(g.has(map[0]))k.set(map[1],g.path(map[0]));
        if(g.has("rubric"))k.set("styleRubric",g.path("rubric"));
        var ids=c.putArray("spanIds");
        for(var printed:g.path("sourcePrintedPages")){
          var matched=spans.stream().filter(v->v.sourceHash.equals("e9331c80662ecbaf26d44d8cd671e8556b2cb1fbcef341cf1112cbd52f113c67") && v.pageIndex==printed.asInt()+1).toList();
          require(!matched.isEmpty());matched.forEach(v->ids.add(v.id.toString()));
        }
      }
    }else require(controls.isMissingNode());
  }
  static ObjectNode summary(ObjectNode s){
    var o=JSON.createObjectNode().put("calls",s.path("priorCalls").asInt()+s.path("calls").size()).put("tokens",s.path("spent").asLong())
      .put("status",s.path("status").asString("DRAFT")).put("calibrated",s.path("calibrated").asBoolean());
    var a=o.putArray("slots");
    for(var r:s.path("slots"))a.addObject().put("kind",r.path("kind").asString()).put("order",r.path("order").asInt())
      .put("stage",r.path("stage").asString()).put("cycles",r.path("cycles").asInt()).put("replans",r.path("replans").asInt())
      .put("issue",r.path("issue").asString(""));
    return o;
  }
  static JsonNode spans(JsonNode plan,JsonNode ids){
    require(ids.isArray() && ids.size()>0 && ids.size()<=20);
    var out=JSON.createArrayNode(); var seen=new HashSet<String>();
    for(var id:ids){require(seen.add(id.asString()));out.add(plan.path("passages").valueStream().filter(v->v.path("id").equals(id)).findFirst().orElseThrow(StudyException::missing));}
    return out;
  }
  static void init(ObjectNode s,JsonNode p){
    s.put("status","DRAFT").put("priorCalls",p.path("priorCalls").asInt()).put("spent",p.path("priorTokens").asInt());s.putArray("calls");var slots=s.putArray("slots");
    for(String part:List.of("required","extension"))for(var row:p.path("blueprint").path("slots").path(part)){
      var r=slots.addObject().put("part",part).put("kind",row.path("kind").asString()).put("order",row.path("order").asInt()).put("stage","PLANNED").put("cycles",0).put("replans",0);
      r.put("heldOut",(part.equals("extension")&&row.path("order").asInt()==2)||(r.path("kind").asString().equals("single_choice")&&row.path("order").asInt()==4));
    }
    require(slots.size()==8);
  }
  static ObjectNode visible(JsonNode q,JsonNode source){
    var v=JSON.createObjectNode();
    for(String f:List.of("kind","prompt","context","options","guidance","responseSchema"))if(q.has(f))v.set(f,q.path(f));
    v.set("reading",source);return v;
  }
  static ObjectNode task(String stage,int slot,JsonNode payload){
    var t=JSON.createObjectNode().put("stage",stage).put("slot",slot);t.set("payload",payload);return t;
  }
  static int priority(JsonNode r){
    String kind=r.path("kind").asString();int order=r.path("order").asInt();
    if(kind.equals("essay"))return 0;
    if(kind.equals("single_choice") && order==1)return 1;
    if(r.path("heldOut").asBoolean())return 2;
    return 3;
  }
  static ObjectNode next(ObjectNode s,JsonNode p){
    if(!s.has("slots"))init(s,p);
    var controls=p.path("controls");
    if(controls.size()>0 && !s.has("controlReview")){
      var items=JSON.createArrayNode();boolean reviewing=s.has("controlBlind");int i=0;
      for(var c:controls){
        var v=visible(c.path("question"),c.path("spanIds").isEmpty()?JSON.createArrayNode():spans(p,c.path("spanIds")));
        var row=items.addObject().set("learner",v);
        if(reviewing){row.set("key",c.path("key"));row.set("blind",s.path("controlBlind").path("items").path(i));} i++;
      }
      return task(reviewing?"review":"blind",-2,items);
    }
    if(!s.has("planned")){
      var input=JSON.createObjectNode();input.set("slots",s.path("slots"));input.set("spans",p.path("passages"));return task("plan",-1,input);
    }
    // Complete the first essay and MCQ before progressing to new slots; repairs follow fresh revisions.
    var slots=s.path("slots");var sorted=new ArrayList<Integer>();for(int i=0;i<slots.size();i++)sorted.add(i);
    sorted.sort(Comparator.<Integer>comparingInt(i->priority(slots.path(i))).thenComparingInt(i->slots.path(i).path("cycles").asInt()-(Set.of("blind","review").contains(slots.path(i).path("stage").asString())?1:0))
      .thenComparingInt(i->slots.path(i).path("kind").asString().equals("essay")?-1:i));
    for(int i:sorted){
      var r=slots.path(i).asObject();String stage=r.path("stage").asString();
      if(!Set.of("write","blind","review").contains(stage))continue;
      var m=r.path("manifest");var sources=spans(p,m.path("spanIds"));
      if(stage.equals("write")){
        var input=JSON.createObjectNode().put("part",r.path("part").asString()).put("kind",r.path("kind").asString()).put("order",r.path("order").asInt()).put("optionCount",p.path("choiceOptionCount").asInt(4));
        input.set("contract",m);input.set("sources",sources);
        if(r.has("candidate"))input.set("previous",r.path("candidate"));
        if(r.has("finding")){input.set("repair",r.path("finding"));input.put("repairComponent",r.path("repairComponent").asString("task"));}
        return task(stage,i,input);
      }
      var item=JSON.createObjectNode().set("learner",visible(r.path("candidate").path("question"),sources));
      if(stage.equals("review")){item.set("key",r.path("candidate").path("key"));item.set("blind",r.path("blind").path("items").path(0));}
      return task(stage,i,JSON.createArrayNode().add(item));
    }
    if(slots.valueStream().allMatch(r->"ACCEPTED".equals(r.path("stage").asString())) && !s.has("assembly")){
      var qs=JSON.createArrayNode();slots.forEach(r->qs.add(r.path("candidate").path("question")));return task("assemble",-1,qs);
    }
    return null;
  }
  static ObjectNode reserve(StudyEngineJob j,JsonNode p,ObjectNode s){
    if(s.has("pending"))return JSON.createObjectNode().put("action","RECONCILE").put("callId",s.path("pending").asString());
    var t=next(s,p);
    if(t==null || s.path("calls").size()+s.path("priorCalls").asInt()>=CALLS || s.path("spent").asLong()+18000+(t==null?0:t.toString().length()/2)>TOKENS){
      s.put("status",t==null?"SLOTS_UNRESOLVED":"BUDGET_PAUSED");j.state="BLOCKED";j.result=s.toString();
      return JSON.createObjectNode().put("action","STOP").put("reason",s.path("status").asString());
    }
    int slot=t.path("slot").asInt();String stage=t.path("stage").asString();
    int revision=0;
    if(slot>=0){var r=s.path("slots").path(slot).asObject();revision=r.path("cycles").asInt();
      if(stage.equals("write")){require(revision<3);r.put("cycles",++revision);}}
    String digest=hash(p.path("inputDigest").asString()+"/"+REVIEW+"/"+revision+"/"+t);
    String id=hash(j.id+"/"+s.path("calls").size()+"/"+digest);
    var entry=s.withArrayProperty("calls").addObject().put("callId",id).put("stage",stage).put("slot",slot)
      .put("worker",j.workerId.toString()).put("revision",revision).put("inputDigest",digest).put("policy",REVIEW).put("campaign",j.id.toString())
      .put("requestedModel","gpt-6.2-astra").put("requestedEffort","high").put("status","RESERVED").put("usageStatus","UNKNOWN");
    entry.set("lease",JSON.getNodeFactory().stringNode(j.leaseToken.toString()));
    s.put("pending",id);j.result=s.toString();
    return t.put("action","CALL").put("callId",id).put("inputDigest",digest);
  }
  static String checkCandidate(JsonNode p,JsonNode r,JsonNode c){
    try{
      var q=c.path("question");var k=c.path("key");var source=spans(p,r.path("manifest").path("spanIds"));
      var primary=source.valueStream().filter(v->v.path("id").equals(q.path("source").path("section"))).findFirst().orElseThrow();
      require(primary.path("materialId").equals(q.path("source").path("materialId")));
      questions(JSON.createArrayNode().add(q),Set.of(primary.path("materialId").asString()));
      safeText(c);
      require(q.path("order").equals(r.path("order")) && q.path("kind").equals(r.path("kind")) && q.path("version").asInt()==1 && k.path("questionId").equals(q.path("id")) && k.path("part").equals(r.path("part")));
      require(k.path("hints").size()==3 && k.path("rubric").size()>0 && k.path("citations").size()>0);
      if(q.path("kind").asString().equals("single_choice")){
        require(q.path("options").size()==p.path("choiceOptionCount").asInt(4) && q.path("options").valueStream().anyMatch(o->o.path("id").equals(k.path("answer"))));
        for(var o:q.path("options"))if(!o.path("id").equals(k.path("answer")))text(k.path("incorrectReasons"),o.path("id").asString(),16000);
      }
      boolean bound=false;
      for(var ref:k.path("citations")){
        var span=source.valueStream().filter(v->v.path("id").equals(ref.path("excerptId"))).findFirst().orElseThrow();
        String quote=text(ref,"quote",3000);if(quote.length()<12 || !span.path("text").asString().contains(quote))return "SOURCE_QUOTE_MISMATCH";
        bound|=span.equals(primary);
      }
      if(!bound)return "SOURCE_QUOTE_MISMATCH";
      var issues=StudyQuality.questionIssues(q,k);return issues.isEmpty()?"":issues.iterator().next();
    }catch(RuntimeException ex){return "SCHEMA";}
  }
  static void repair(ObjectNode r,String issue,JsonNode finding){
    r.put("issue",issue);r.set("finding",finding);
    r.put("repairComponent",switch(issue){case "HINT_LEAK","HINT_PROGRESSION","HINT_ANSWER_LEAK" -> "hints";case "RUBRIC" -> "rubric";case "HIDDEN_PREMISE","SOURCE_QUOTE_MISMATCH" -> "key";case "SCHEMA" -> "structure";case "SOURCE_UNSUITABLE" -> "source";default -> "task";});
    if(issue.equals("SOURCE_UNSUITABLE")){
      if(!r.has("alternate") || r.path("replans").asInt()>0){r.put("stage","UNRESOLVED");return;}
      r.withArrayProperty("priorManifests").add(r.path("manifest"));r.set("manifest",r.path("alternate"));r.put("replans",1);r.put("parentManifest",r.path("manifestDigest").asString());r.put("manifestDigest",hash(r.path("parentManifest")+"/"+r.path("manifest")));
    }
    r.put("stage",r.path("cycles").asInt()<3?"write":"UNRESOLVED");
  }
  static void manifest(JsonNode p,JsonNode m){
    text(m,"objective",700);text(m,"limit",1000);text(m,"family",100);
    var ss=spans(p,m.path("spanIds"));String quote=text(m,"principleQuote",1800);
    require(quote.length()>=12 && ss.valueStream().anyMatch(v->v.path("text").asString().contains(quote)));
    var all=p.path("passages").valueStream().map(v->v.path("id").asString()).toList();
    int start=all.indexOf(ss.path(0).path("id").asString());
    for(int n=0;n<ss.size();n++)require(ss.path(n).path("quality").asString().equals("usable") && all.indexOf(ss.path(n).path("id").asString())==start+n);
    for(int i=1;i<ss.size();i++)require(ss.path(i).path("pageIndex").asInt()-ss.path(i-1).path("pageIndex").asInt()>=0 && ss.path(i).path("pageIndex").asInt()-ss.path(i-1).path("pageIndex").asInt()<=1);
  }
  static void apply(ObjectNode s,JsonNode p,ObjectNode e,JsonNode out){
    int i=e.path("slot").asInt();String stage=e.path("stage").asString();
    if(i==-2){
      require(out.path("items").size()==p.path("controls").size());
      s.set(stage.equals("blind")?"controlBlind":"controlReview",out);
      if(stage.equals("review")){
        boolean agreed=true;int positives=0,negatives=0;
        for(int n=0;n<p.path("controls").size();n++){
          var c=p.path("controls").path(n);String expected=c.path("expected").asString("");
          if(expected.equals("control"))continue;
          var f=out.path("items").path(n);var b=s.path("controlBlind").path("items").path(n);
          boolean accepted=f.path("issue").asString("").equals("none") && f.path("grounded").asBoolean() && f.path("hintsSafe").asBoolean() && f.path("reasoning").asBoolean() && b.path("solvable").asBoolean();
          if(expected.equals("pass")){positives++;agreed &= accepted;}else if(expected.equals("reject")){negatives++;agreed &= !accepted;}else agreed=false;
        }
        s.put("calibrated",agreed && positives>=2 && negatives>=3);
      }
      return;
    }
    if(stage.equals("plan")){
      require(out.path("slots").size()==8);
      for(int n=0;n<8;n++){
        var r=s.path("slots").path(n).asObject();var m=out.path("slots").path(n);
        try {manifest(p,m.path("primary"));require(m.path("supported").asBoolean());r.set("manifest",m.path("primary"));r.put("manifestDigest",hash(p.path("inputDigest")+"/"+n+"/"+m.path("primary")));r.put("stage","write");
          if(m.path("alternate").isObject())try{manifest(p,m.path("alternate"));if(!m.path("primary").path("spanIds").equals(m.path("alternate").path("spanIds")))r.set("alternate",m.path("alternate"));}catch(StudyException ignored){/* Unsupported alternate cannot authorize a replan. */}
        }catch(RuntimeException ex){r.put("stage","UNRESOLVED").put("issue","SOURCE_UNSUITABLE");}
      }
      s.put("planned",true);return;
    }
    if(stage.equals("assemble")){s.set("assembly",out);return;}
    var r=s.path("slots").path(i).asObject();
    if(stage.equals("write")){
      var prior=r.path("candidate");String component=r.path("repairComponent").asString("");
      var candidate=out.deepCopy().asObject();
      if(prior.isObject() && Set.of("hints","rubric","key").contains(component)){
        candidate.set("question",prior.path("question"));
        if(!component.equals("key")){
          var corrected=out.path("key").path(component);var k=prior.path("key").deepCopy().asObject();k.set(component,corrected);candidate.set("key",k);
        }
      }
      r.set("candidate",candidate);r.remove("blind");String issue=checkCandidate(p,r,candidate);
      if(issue.isEmpty())r.put("stage","blind");else repair(r,issue,JSON.getNodeFactory().stringNode(issue));
    }else if(stage.equals("blind")){
      require(out.path("items").size()==1);r.set("blind",out);r.put("stage","review");
    }else{
      require(out.path("items").size()==1);var f=out.path("items").path(0);
      String issue=text(f,"issue",60);text(f,"evidence",1500);text(f,"repair",1500);text(f,"field",180);
      var q=r.path("candidate").path("question");var key=r.path("candidate").path("key");var b=r.path("blind").path("items").path(0);
      if(issue.equals("none") && !claimsBound(r,p,f))issue="HIDDEN_PREMISE";
      if(issue.equals("none") && (!f.path("grounded").asBoolean()||!f.path("hintsSafe").asBoolean()||!f.path("reasoning").asBoolean()||!b.path("solvable").asBoolean()||
          (q.path("kind").asString().equals("single_choice") && !b.path("answer").equals(key.path("answer")))))issue="DISAGREEMENT";
      if(issue.equals("none")){r.put("acceptedRevision",r.path("cycles").asInt()).put("stage","ACCEPTED").put("issue","").put("receiptDigest",hash(REVIEW+"/"+r.path("manifest")+"/"+r.path("candidate")+"/"+r.path("blind")+"/"+out));r.set("review",f);}
      else repair(r,issue,f);
    }
  }
  static boolean claimsBound(JsonNode r,JsonNode plan,JsonNode f){
    var key=r.path("candidate").path("key");var targets=new HashMap<String,String>();
    for(String name:List.of("answer","model","explanation"))targets.put(name,key.path(name).asString(""));
    for(int i=0;i<key.path("rubric").size();i++)targets.put("rubric."+i,key.path("rubric").path(i).asString());
    for(var e:key.path("incorrectReasons").properties())targets.put("incorrect."+e.getKey(),e.getValue().asString());
    var evidence=new ArrayList<String>();var q=r.path("candidate").path("question");
    for(String field:List.of("prompt","context","guidance"))evidence.add(q.path(field).asString(""));
    q.path("options").forEach(o->{evidence.add(o.path("text").asString());evidence.add(o.path("id").asString());});
    spans(plan,r.path("manifest").path("spanIds")).forEach(v->evidence.add(v.path("text").asString()));
    var seen=new HashSet<String>();
    for(var c:f.path("claimChecks")){
      String field=c.path("field").asString(), claim=c.path("claim").asString(""), anchor=c.path("anchor").asString("");
      if(!targets.containsKey(field)||claim.isBlank()||!targets.get(field).contains(claim)||!c.path("supported").asBoolean()||anchor.isBlank()||evidence.stream().noneMatch(v->v.contains(anchor))||c.path("reason").asString("").isBlank())return false;
      seen.add(field);
    }
    return seen.equals(targets.keySet());
  }
  private StudyCampaign(){}
}

