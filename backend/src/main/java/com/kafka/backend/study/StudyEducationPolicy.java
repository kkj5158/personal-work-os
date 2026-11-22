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
