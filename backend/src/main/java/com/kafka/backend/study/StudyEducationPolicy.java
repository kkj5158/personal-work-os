package com.kafka.backend.study;

import static com.kafka.backend.study.StudyEngineRules.hash;
import static com.kafka.backend.study.StudyException.require;
import static com.kafka.backend.study.StudyValidation.JSON;
import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Owner-approved fixture bytes and input contract. Historical jobs retain their frozen inputs. */
final class StudyEducationPolicy {
  static final String VERSION = "study-education-v1-golden-v2";
  static final String POLICY_SHA = "0e2cf74aa811b4339d0a8b5669ed7b958830b353eccaafdba165aeb1cfd0883b";
  static final String V1 = "5ac20b66f6c720b52de951456de1b429ffd44f1639cf7c1bd17f88184d091292";
  static final String V2 = "3a2b420142b9f7c41a37631fe4ac23a5e47773bc9f931873257d3516e57b95f6";

  static final String FROZEN="study-golden-v2-g01-followup-approved-20261123";
  static final String FROZEN_SHA="a4470406073900d9526fcfa9f27470137c250045b1fcaa6f5f1c150528063d3a";
  static final String MANIFEST_SHA="6086a944f7c8d6f8ed035f7a3b7938600abf8162602a4a546abb51f081728720";
  static final String GROUNDED="study-golden-v2-g01-grounded-explanation-20261123";
  static final String GROUNDED_SHA="5fcd5b235ce75765049feeac4ddb5189393bc746c00271f91063ed8c20cee154";
  static final String GROUNDED_MANIFEST_SHA="b5ceed8f00ca7710491bb9c240e6195f322f74c511ffc71678e0a2e6de208492";
  static String grounded(){
    var manifest=JSON.readTree(resource("POS_STUDY_G01_GROUNDED_EXPLANATION_MANIFEST.json",GROUNDED_MANIFEST_SHA));
    require(GROUNDED.equals(manifest.path("releaseId").asString()) && FROZEN.equals(manifest.path("parentRelease").asString())
        && FROZEN_SHA.equals(manifest.path("parentSha256").asString())
        && GROUNDED_SHA.equals(manifest.path("approvedSha256").asString())
        && manifest.path("changedPaths").size()==2
        && ".cases[0].rationale".equals(manifest.path("changedPaths").path(0).asString())
        && ".cases[0].distractorReasons.C".equals(manifest.path("changedPaths").path(1).asString()));
    return resource(manifest.path("approvedFile").asString(),GROUNDED_SHA);
  }
  static String frozen(){
    var manifest=JSON.readTree(resource("POS_STUDY_G01_FOLLOWUP_MANIFEST.json",MANIFEST_SHA));
    require(FROZEN.equals(manifest.path("releaseId").asString()) && V2.equals(manifest.path("baseSha256").asString())
        && FROZEN_SHA.equals(manifest.path("approvedSha256").asString()));
    return resource(manifest.path("approvedFile").asString(),FROZEN_SHA);
  }
  static ObjectNode resumeFrozen(StudyEngineJob parent,StudyEngineJob original){
    var s=StudyCampaign.state(parent);
    var historical=StudyCampaign.state(original);
    var audit=s.path("policyContinuation");
    require("BLOCKED".equals(parent.state) && "GOLDEN_SEMANTIC_DISPUTE".equals(s.path("status").asString())
        && !s.has("pending") && !s.path("calibrated").asBoolean() && s.path("calls").size()==42
        && s.path("spent").asLong()==1025580 && s.path("slots").size()==8 && historical.path("slots").size()==8
        && hash(original.result).equals(audit.path("parentResultDigest").asString())
        && original.id.toString().equals(audit.path("parentJobId").asString()));
    var ids=new HashSet<String>();long spent=0;
    for(var call:s.path("calls")){
      require(ids.add(call.path("callId").asString()) && call.path("receipt").path("callId").equals(call.path("callId"))
          && "COMPLETED".equals(call.path("status").asString()) && call.path("campaign").equals(s.path("campaignId")));
      spent+=call.path("usage").path("input_tokens").asLong()+call.path("usage").path("output_tokens").asLong();
    }
    require(spent==s.path("spent").asLong());
    for(int i=0;i<40;i++)require(s.path("calls").path(i).equals(historical.path("calls").path(i)));
    int accepted=0;
    for(int i=0;i<8;i++){
      var slot=s.path("slots").path(i).asObject();var old=historical.path("slots").path(i);
      require(slot.path("candidate").equals(old.path("candidate")) && slot.path("cycles").equals(old.path("cycles"))
          && slot.path("stage").asString().equals("review"));
      if("ACCEPTED".equals(old.path("stage").asString())){
        require(slot.path("preserveCandidate").asBoolean() && old.has("receiptDigest"));
        slot.set("receiptDigest",old.path("receiptDigest"));slot.set("acceptedRevision",old.path("acceptedRevision"));
        slot.set("review",old.path("review"));slot.put("stage","ACCEPTED");accepted++;
      }else require(slot.path("cycles").asInt()==2);
    }
    require(accepted==3);
    s.putObject("frozenContinuation").put("parentId",parent.id.toString()).put("parentResultDigest",hash(parent.result));
    s.remove("controlReview");s.remove("controlBlind");s.put("status","DRAFT").put("goldenRelease",FROZEN);
    return s;
  }
  /**
   * Review-only continuation of the owner-approved two-field G01 explanation fix.
   * Uses the existing blind decisions only when the learner-visible question,
   * source span IDs, and reference context all match byte-for-byte in JSON.
   */
  static ObjectNode resumeGrounded(StudyEngineJob parent,ObjectNode plan) {
    var parentPlan=JSON.readTree(parent.input);
    var state=StudyCampaign.state(parent);
    require("GENERATE".equals(parent.kind) && "BLOCKED".equals(parent.state)
        && "GOLDEN_SEMANTIC_DISPUTE".equals(state.path("status").asString())
        && FROZEN.equals(parentPlan.path("goldenRelease").asString())
        && FROZEN_SHA.equals(parentPlan.path("goldenSha256").asString())
        && !state.has("pending") && !state.path("calibrated").asBoolean()
        && state.path("calls").size()==44 && state.path("spent").asLong()==1085043
        && state.path("slots").size()==8 && state.path("controlBlind").path("items").size()==5
        && state.path("controlReview").path("items").size()==5
        && parentPlan.path("passages").equals(plan.path("passages")));
    long spent=0;var ids=new HashSet<String>();
    for(var entry:state.path("calls")){
      String id=entry.path("callId").asString();
      require(!id.isBlank() && ids.add(id)
          && id.equals(entry.path("receipt").path("callId").asString())
          && "COMPLETED".equals(entry.path("status").asString())
          && entry.path("campaign").equals(state.path("campaignId")));
      for(String field:List.of("input_tokens","output_tokens")){
        var tokens=entry.path("usage").path(field);
        require(tokens.isIntegralNumber() && tokens.asLong()>=0);
        spent+=tokens.asLong();
      }
    }
    require(spent==state.path("spent").asLong());
    for(int i=0;i<5;i++){
      var old=parentPlan.path("controls").path(i);
      var now=plan.path("controls").path(i);
      require(old.path("question").equals(now.path("question"))
          && old.path("referenceId").equals(now.path("referenceId"))
          && old.path("referenceContext").equals(now.path("referenceContext"))
          && old.path("spanIds").equals(now.path("spanIds")));
      if(i>0)require(old.path("key").equals(now.path("key")));
      else {
        var oldKey=old.path("key").deepCopy().asObject();
        var nowKey=now.path("key").deepCopy().asObject();
        require(oldKey.path("answer").equals(nowKey.path("answer"))
            && oldKey.path("hints").equals(nowKey.path("hints"))
            && !oldKey.path("explanation").equals(nowKey.path("explanation"))
            && !oldKey.path("incorrectReasons").path("C").equals(nowKey.path("incorrectReasons").path("C")));
        oldKey.set("explanation",nowKey.path("explanation"));
        oldKey.path("incorrectReasons").asObject().set("C",nowKey.path("incorrectReasons").path("C"));
        require(oldKey.equals(nowKey));
      }
    }
    var originalBlind=StudyCampaign.controlTask(parentPlan,null);
    var newBlind=StudyCampaign.controlTask(plan,null);
    var entry=state.path("calls").path(42);
    String inputDigest=hash(parentPlan.path("inputDigest").asString()+"/"+StudyCampaign.reviewPolicy(state)+"/0/"+originalBlind);
    require(originalBlind.toString().equals(newBlind.toString()) && "blind".equals(entry.path("stage").asString(""))
        && entry.path("slot").asInt()==-2 && inputDigest.equals(entry.path("inputDigest").asString(""))
        && entry.path("output").equals(state.path("controlBlind")));
    int accepted=0,unresolved=0;
    for(var slot:state.path("slots")){
      if("ACCEPTED".equals(slot.path("stage").asString())){
        require(slot.has("receiptDigest") && slot.has("candidate") && slot.has("blind"));accepted++;
      } else {
        require("review".equals(slot.path("stage").asString()) && slot.path("cycles").asInt()==2
            && slot.has("candidate"));unresolved++;
      }
    }
    require(accepted==3 && unresolved==5);
    state.putObject("groundedContinuation")
        .put("parentJobId",parent.id.toString())
        .put("parentResultDigest",hash(parent.result))
        .put("priorCalls",44).put("priorTokens",1085043)
        .put("blindCallId",entry.path("callId").asString()).put("blindInputDigest",inputDigest)
        .put("learnerPayloadSha256",hash(newBlind.path("payload").toString())).put("blindReused",true).put("learnerControlsIdentical",true);
    state.remove("controlReview"); // preserve the independently answered controlBlind
    state.put("calibrated",false).put("status","DRAFT").put("goldenRelease",GROUNDED);
    return state;
  }
  static boolean active(JsonNode node) {return VERSION.equals(node.path("authoringPolicy").asString(""));}
  static String resource(String name, String digest) {
    try (var stream = StudyEducationPolicy.class.getResourceAsStream("/study/policy/" + name)) {
      require(stream != null);
      byte[] bytes = stream.readAllBytes();
      String raw = new String(bytes,StandardCharsets.UTF_8);
      require(Arrays.equals(bytes,raw.getBytes(StandardCharsets.UTF_8)) && hash(raw).equals(digest));
      return raw;
    } catch(IOException ex) {throw new IllegalStateException("Approved resource unavailable",ex);}
  }
  static String golden(){return resource("POS_STUDY_GOLDEN_DATASET_V2_APPROVED.json",V2);}
  static void verify(String raw,boolean v2){
    require(raw.length()<150000 && hash(raw).equals(v2?V2:V1));
    var data=JSON.readTree(raw);
    require(data.path("schemaVersion").asString().equals(v2?"quality-golden-v2":"quality-golden-v1")
        && data.path("source").path("sha256").asString().equals(StudyCampaignContinuation.SOURCE) && data.path("cases").size()==7);
    if(v2)require(V1.equals(data.path("approvalRecord").path("parentSha256").asString())
        && "NOT_YET_VERIFIED".equals(data.path("approvalRecord").path("semanticReviewStatus").asString()));
  }
  static String tier(String kind,int order) {
    if(!"single_choice".equals(kind))return "open_reasoning";
    return switch(order){case 1,2 -> "cause_analysis";case 3 -> "basic_application";case 4,5 -> "advanced_integration";default -> throw StudyException.invalid();};
  }
  static void bind(ObjectNode plan,List<StudySourceExcerpt> chapter,UUID owner,String raw){
    resource("POS_STUDY_EDUCATION_POLICY_V1_0_FINAL.md",POLICY_SHA);
    require(chapter.size()==28);
    var pages=new HashSet<Integer>();var first=chapter.getFirst();
    for(var e:chapter){
      require(owner.equals(e.ownerId) && StudyCampaignContinuation.SOURCE.equals(e.sourceHash)
          && first.materialId.equals(e.materialId) && first.assetId.equals(e.assetId)
          && first.materialVersion==e.materialVersion && first.parserVersion.equals(e.parserVersion)
          && e.pageIndex>=26 && e.pageIndex<=53 && pages.add(e.pageIndex) && !e.body.isBlank());
    }
    plan.put("authoringPolicy",VERSION).put("policySha256",POLICY_SHA).put("goldenSha256",V2).put("goldenParentSha256",V1);
    plan.withObjectProperty("minutes").put("required",15).put("extension",30);
    var bp=plan.path("blueprint").asObject();
    bp.set("targetMinutes",plan.path("minutes").deepCopy());
    for(String part:List.of("required","extension"))for(var row:bp.path("slots").path(part)){
      row.asObject().put("objectiveTier",tier(row.path("kind").asString(),row.path("order").asInt()));
    }
    StudyCampaign.bindControls(plan,chapter,JSON.getNodeFactory().stringNode(raw),true);
    require(plan.path("controls").size()==5);
  }
  static void validateControlOutput(String stage,JsonNode out){
    require(out.path("items").isArray());
    for(var item:out.path("items")){
      if(stage.equals("blind")){
        require(item.path("answer").isString() && !item.path("reason").asString("").isBlank() && item.path("solvable").isBoolean());
      }else{
        require(Set.of("none","SOURCE_UNSUITABLE","HIDDEN_PREMISE","AMBIGUOUS","SHORTCUT","HINT_LEAK","RUBRIC","DISTRACTOR","UNCERTAIN").contains(item.path("issue").asString(""))
            && !item.path("evidence").asString("").isBlank() && !item.path("field").asString("").isBlank()
            && item.path("claimChecks").isArray() && item.path("grounded").isBoolean()
            && item.path("hintsSafe").isBoolean() && item.path("reasoning").isBoolean()
            && !item.path("uncertainty").asString("").isBlank());
      }
    }
  }
  static ObjectNode resume(StudyEngineJob parent,ObjectNode plan) {
    var state=StudyCampaign.state(parent);
    require("BLOCKED".equals(parent.state) && "BUDGET_PAUSED".equals(state.path("status").asString())
        && !state.has("pending") && !active(state) && state.has("continuation") && state.path("planned").asBoolean()
        && state.path("calls").size()==40 && state.path("spent").asLong()==966552 && state.path("priorCalls").asInt()==0);
    long spent=0;var ids=new HashSet<String>();
    for(var call:state.path("calls")){
      require(ids.add(call.path("callId").asString()) && "COMPLETED".equals(call.path("status").asString())
          && call.path("receipt").path("callId").equals(call.path("callId"))
          && call.path("campaign").equals(state.path("campaignId")));
      for(String field:List.of("input_tokens","output_tokens")){
        var count=call.path("usage").path(field);require(count.isIntegralNumber() && count.asLong()>=0);spent+=count.asLong();
      }
    }
    require(spent==state.path("spent").asLong() && state.path("slots").size()==8);
    state.put("authoringPolicy",VERSION).put("status","DRAFT").put("calibrated",false);
    for(String field:List.of("controlBlind","controlReview","calibrationStop"))state.remove(field);
    var lineage=state.putObject("policyContinuation").put("parentJobId",parent.id.toString())
        .put("parentInputDigest",hash(parent.input)).put("parentResultDigest",hash(parent.result))
        .put("parentReceiptDigest",hash(parent.receipt)).put("calls",ids.size()).put("tokens",spent);
    var prior=lineage.putArray("slots");
    var seen=new HashSet<String>();
    for(var item:state.path("slots")){
      var slot=item.asObject();String part=slot.path("part").asString();int order=slot.path("order").asInt();
      var blueprint=plan.path("blueprint").path("slots").path(part).path(order-1);
      require(seen.add(part+"/"+order) && slot.path("kind").equals(blueprint.path("kind")) && slot.has("candidate")
          && slot.path("cycles").asInt()>=1 && slot.path("cycles").asInt()<=3);
      var audit=prior.addObject().put("part",part).put("order",order).put("cycles",slot.path("cycles").asInt())
          .put("contentDigest",hash(slot.path("candidate").toString()));
      if("ACCEPTED".equals(slot.path("stage").asString())){
        require(slot.has("receiptDigest"));audit.set("receiptDigest",slot.path("receiptDigest"));slot.put("preserveCandidate",true);
      }
      slot.set("objectiveTier",blueprint.path("objectiveTier"));
      var authored=StudyCampaign.candidateManifest(slot).deepCopy();
      StudyCampaign.manifest(plan,authored);slot.set("manifest",authored);
      slot.put("manifestDigest",hash(plan.path("inputDigest")+"/"+authored));
      slot.remove("receiptDigest");
      String defect=StudyCampaign.checkCandidate(plan,slot,slot.path("candidate"));
      if(!defect.isEmpty())StudyCampaign.repair(slot,defect,JSON.getNodeFactory().stringNode(defect));
      else slot.put("stage",slot.has("blind") && StudyCampaign.blindDigest(plan,slot).equals(slot.path("blindDigest").asString(""))?"review":"blind");
    }
    require(prior.valueStream().filter(r->r.has("receiptDigest")).count()==3);
    return state;
  }
  static void requireReviewEvidence(JsonNode finding,JsonNode key,JsonNode learner) {
    // Structural credibility is independent of whether the verdict agrees with the owner.
    var checks=finding.path("claimChecks");
    if(key.isEmpty() || !"none".equals(finding.path("issue").asString()))return;
    require(!checks.isEmpty());
    var targets=new HashMap<String,String>();
    for(String f:List.of("answer","model","explanation"))if(key.has(f))targets.put(f,key.path(f).asString());
    for(int i=0;i<key.path("rubric").size();i++)targets.put("rubric."+i,key.path("rubric").path(i).asString());
    key.path("incorrectReasons").properties().forEach(e->targets.put("incorrect."+e.getKey(),e.getValue().asString()));
    var anchors=new ArrayList<String>();
    for(String f:List.of("prompt","context","guidance"))anchors.add(learner.path(f).asString(""));
    learner.path("options").forEach(o->{anchors.add(o.path("id").asString());anchors.add(o.path("text").asString());});
    learner.path("reading").forEach(r->anchors.add(r.path("text").asString()));
    var covered=new HashSet<String>();
    for(var c:checks){
      String field=c.path("field").asString(""),claim=c.path("claim").asString(""),anchor=c.path("anchor").asString("");
      require(!claim.isBlank() && targets.getOrDefault(field,"").contains(claim) && c.path("supported").asBoolean()
          && !anchor.isBlank() && anchors.stream().anyMatch(a->a.contains(anchor)) && !c.path("reason").asString("").isBlank());
      covered.add(field);
    }
    require(covered.equals(targets.keySet()));
  }
  static boolean variedOperations(JsonNode slots){
    // Rewording an objective under the same principle and reasoning operation adds no coverage.
    var pairs=new HashSet<String>();
    for(var slot:slots){
      var m=slot.path("manifest");pairs.add(m.path("family").asString()+"/"+m.path("principleQuote").asString().strip());
    }
    return pairs.size()>=3;
  }
  private StudyEducationPolicy(){}
}
